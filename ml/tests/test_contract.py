"""Guards ../contracts/detector-registry.json against drift from this
component's real sources: `vtml.types.Channel` and
`vtml.detectors.schema.REGISTRY`.

This is not a fusion test. It never imports or asserts on LLR values,
weights, or scores, so it carries none of section 5's fusion-constant
restrictions. It only checks that the shared contract -- read by the
backend side too, see docs/cross-component-architecture.md -- still
describes this component's actual detector vocabulary.

If this fails, `../contracts/detector-registry.json` is stale: update
it in the same change as whatever edited `Channel` or `REGISTRY`.
"""

from __future__ import annotations

import json
from pathlib import Path

from vtml.detectors.schema import REGISTRY
from vtml.types import Channel

_CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "detector-registry.json"


def _load_contract() -> dict:
    return json.loads(_CONTRACT_PATH.read_text())


def test_contract_file_exists() -> None:
    assert _CONTRACT_PATH.is_file(), f"expected shared contract at {_CONTRACT_PATH}"


def test_ml_channels_match_the_contract() -> None:
    contract = _load_contract()
    assert contract["mlChannels"]["values"] == [c.value for c in Channel]


def test_every_registry_type_is_documented_with_the_right_wire_channel() -> None:
    contract = _load_contract()
    documented = contract["mlDetectorTypes"]["values"]
    for type_, spec in REGISTRY.items():
        assert type_ in documented, f"REGISTRY has {type_!r} but the contract does not document it"
        assert documented[type_]["channel"] == spec.channel.value, type_
        assert documented[type_]["wire_channel"] == spec.wire_channel, type_


def test_every_documented_type_is_still_a_real_registry_entry() -> None:
    contract = _load_contract()
    documented = contract["mlDetectorTypes"]["values"]
    for type_ in documented:
        assert type_ in REGISTRY, f"contract documents {type_!r} but REGISTRY has no such entry"


def test_type_mapping_keys_are_all_real_registry_entries() -> None:
    contract = _load_contract()
    for ml_type in contract["typeMapping"]:
        assert ml_type in REGISTRY, f"typeMapping key {ml_type!r} is not in REGISTRY"
