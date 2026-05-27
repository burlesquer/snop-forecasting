"""
Deterministic mapping from M5 raw identifiers → Korean cosmetics scenario.

This is the 'cosmetics reframing' layer: M5 is Walmart grocery/household
data, but the dashboard speaks K-beauty. Mapping is deterministic so
runs are reproducible.

Strategy:
    - M5 category → cosmetics category (4 lanes)
    - M5 item_id hash → cosmetics product name (deterministic)
    - Volume/size derived from M5 dept_id digit
"""
from __future__ import annotations

import hashlib

from ml.schema import SKUMeta

# Selected M5 dept_id → 한국 화장품 카테고리.
# Only 4 lanes for a clean 4-tab narrative in the dashboard. Other depts
# can be added later if scope expands.
CATEGORY_MAP: dict[str, str] = {
    "FOODS_1": "스킨케어",
    "FOODS_2": "메이크업",
    "HOBBIES_1": "프래그런스",
    "HOUSEHOLD_1": "바디케어",
}

# Set of dept_ids included in the subset. Source of truth for prepare_data.
SELECTED_DEPTS: tuple[str, ...] = tuple(CATEGORY_MAP.keys())

# Per-category product name pool (deterministic pick by hash)
PRODUCT_NAMES: dict[str, list[str]] = {
    "스킨케어": [
        "모이스트 글로우 토너",
        "하이드라 에센스",
        "비타민 세럼",
        "리페어 크림",
        "프리미엄 앰플",
        "센텔라 시카 크림",
        "콜라겐 부스터",
        "딥 모이스처라이저",
    ],
    "메이크업": [
        "벨벳 매트 립스틱",
        "글로우 쿠션",
        "에어 핏 파운데이션",
        "쉬머 아이섀도우",
        "샤프 라이너",
        "블러시 듀오",
        "립 틴트",
        "하이라이터 스틱",
    ],
    "헤어케어": [
        "리페어 샴푸",
        "실키 트리트먼트",
        "리브인 컨디셔너",
        "스칼프 토닉",
        "헤어 오일 미스트",
        "볼륨 무스",
    ],
    "프래그런스": [
        "플로럴 오 드 뚜왈렛",
        "우디 퍼퓸",
        "프레시 시트러스",
        "머스크 오 드 퍼퓸",
    ],
    "네일/도구": [
        "벨벳 네일 컬러",
        "글리터 톱코트",
        "큐티클 오일",
    ],
    "바디케어": [
        "리치 바디로션",
        "샤워 오일",
        "퍼퓸 바디미스트",
        "핸드 크림 세트",
        "풋 케어 크림",
    ],
    "클렌징": [
        "젠틀 클렌징 폼",
        "오일 투 폼 클렌저",
        "딥 클렌징 워터",
        "리무버 패드",
    ],
}

# Volume tier by M5 dept digit (rough size variety)
VOLUME_TIERS = ["30ml", "50ml", "100ml", "200ml", "250ml", "500ml"]


def _deterministic_idx(key: str, modulo: int) -> int:
    """Stable index from string — same input always yields same index."""
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % modulo


def map_to_cosmetic(*, m5_item_id: str, m5_dept_id: str) -> SKUMeta:
    """Convert M5 (item_id, dept_id) into a Korean cosmetics SKU display label.

    The cosmetics category and product name are determined deterministically by
    hash of the item_id, so repeated runs yield identical labels.
    """
    category = CATEGORY_MAP.get(m5_dept_id, "기타")
    name_pool = PRODUCT_NAMES.get(category, ["기타 제품"])
    name_base = name_pool[_deterministic_idx(m5_item_id, len(name_pool))]
    volume = VOLUME_TIERS[_deterministic_idx(m5_item_id, len(VOLUME_TIERS))]
    # Short SKU code suffix from item_id for uniqueness in display
    suffix = m5_item_id.split("_")[-1] if "_" in m5_item_id else m5_item_id[-3:]

    display_name = f"{name_base} {volume} (#{suffix})"
    return SKUMeta(
        id=m5_item_id,
        name=display_name,
        category=category,
        category_raw=m5_dept_id,
    )
