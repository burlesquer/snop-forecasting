"""
Generate TypeScript interfaces from ml.schema pydantic models.

Single source of truth: Python pydantic. This script walks the model graph,
maps Python annotations to TypeScript, and writes dashboard/lib/types.generated.ts.

The generated file is committed to git, but checked in CI by re-running this
script and diffing — drift between Python and TypeScript is treated as a
build failure.

Supports:
  - Primitive types (str, int, float, bool)
  - Optional[X] / X | None
  - list[X]
  - Literal["a", "b", "c"]
  - Nested pydantic models (by name)

Limitations: union types beyond X | None are not handled — extend if needed.
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path
from types import UnionType
from typing import Any, Literal, Union, get_args, get_origin

from pydantic import BaseModel

from ml import schema as schema_module

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
log = logging.getLogger("tools.generate_ts_types")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = PROJECT_ROOT / "dashboard" / "lib" / "types.generated.ts"


def _is_optional(annotation: Any) -> tuple[bool, Any]:
    """Detect X | None / Optional[X]. Returns (is_optional, inner_type)."""
    origin = get_origin(annotation)
    if origin in (Union, UnionType):
        args = [a for a in get_args(annotation) if a is not type(None)]
        none_present = type(None) in get_args(annotation)
        if len(args) == 1 and none_present:
            return True, args[0]
    return False, annotation


def _annotation_to_ts(annotation: Any, *, top_optional: bool = False) -> str:
    """Recursively translate a Python annotation to a TS type expression."""
    is_opt, inner = _is_optional(annotation)
    if is_opt:
        return f"{_annotation_to_ts(inner)} | null"

    origin = get_origin(annotation)

    # Literal["a", "b"]
    if origin is Literal:
        parts = [f'"{v}"' if isinstance(v, str) else str(v) for v in get_args(annotation)]
        return " | ".join(parts)

    # list[X]
    if origin in (list, tuple):
        inner_args = get_args(annotation)
        if not inner_args:
            return "unknown[]"
        inner = _annotation_to_ts(inner_args[0])
        # Wrap union types in parens so `X | Y[]` doesn't get parsed as `X | (Y[])`
        if "|" in inner:
            return f"({inner})[]"
        return f"{inner}[]"

    # Union of non-None (rare in our schema)
    if origin in (Union, UnionType):
        return " | ".join(_annotation_to_ts(a) for a in get_args(annotation))

    # Primitive
    if annotation is str:
        return "string"
    if annotation in (int, float):
        return "number"
    if annotation is bool:
        return "boolean"
    if annotation is type(None):
        return "null"

    # Nested pydantic model
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return annotation.__name__

    log.warning("Unknown annotation: %r → emitting 'unknown'", annotation)
    return "unknown"


def _model_to_interface(model: type[BaseModel]) -> str:
    """Emit a TypeScript interface block for one model."""
    lines = [f"export interface {model.__name__} {{"]
    for name, field in model.model_fields.items():
        description = (field.description or "").replace("\n", " ").strip()
        if description:
            lines.append(f"  /** {description} */")
        ts_type = _annotation_to_ts(field.annotation)
        lines.append(f"  {name}: {ts_type};")
    lines.append("}")
    return "\n".join(lines)


def _collect_models() -> list[type[BaseModel]]:
    """Find pydantic models in ml.schema, ordered so referenced types come first."""
    models: list[type[BaseModel]] = []
    seen: set[str] = set()
    for name in dir(schema_module):
        obj = getattr(schema_module, name)
        if (
            isinstance(obj, type)
            and issubclass(obj, BaseModel)
            and obj is not BaseModel
            and obj.__module__ == schema_module.__name__
            and obj.__name__ not in seen
        ):
            models.append(obj)
            seen.add(obj.__name__)

    # Topological sort: dependencies first
    sorted_models: list[type[BaseModel]] = []
    placed: set[str] = set()

    def _deps(m: type[BaseModel]) -> set[str]:
        out: set[str] = set()
        for field in m.model_fields.values():
            for arg in _walk_annotation(field.annotation):
                if (
                    isinstance(arg, type)
                    and issubclass(arg, BaseModel)
                    and arg is not BaseModel
                    and arg.__module__ == schema_module.__name__
                ):
                    out.add(arg.__name__)
        return out

    def _walk_annotation(ann: Any) -> list[Any]:
        nodes: list[Any] = [ann]
        for arg in get_args(ann):
            nodes.extend(_walk_annotation(arg))
        return nodes

    pending = list(models)
    safety = 0
    while pending:
        safety += 1
        if safety > 1000:
            raise RuntimeError("Cyclic dependency or bug in topo sort")
        for m in pending:
            if _deps(m).issubset(placed):
                sorted_models.append(m)
                placed.add(m.__name__)
                pending.remove(m)
                break
        else:
            # No model could be placed — pick the next one (forward refs by name still work)
            m = pending.pop(0)
            sorted_models.append(m)
            placed.add(m.__name__)

    return sorted_models


def generate() -> Path:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    models = _collect_models()
    log.info("Found %d pydantic models in ml.schema", len(models))

    header = f"""// AUTO-GENERATED from ml/schema.py via tools/generate_ts_types.py
// Do NOT edit by hand — regenerate with: python -m tools.generate_ts_types
// Last generated: {datetime.now().isoformat(timespec="seconds")}
// Schema drift between Python and TypeScript will fail the build.
"""
    body = "\n\n".join(_model_to_interface(m) for m in models)
    OUT_PATH.write_text(header + "\n" + body + "\n", encoding="utf-8")
    log.info("✅ Written: %s (%d models)", OUT_PATH, len(models))
    return OUT_PATH


if __name__ == "__main__":
    out = generate()
    print(out.read_text(encoding="utf-8")[:1200])
    print("\n... (truncated)")
    sys.exit(0)
