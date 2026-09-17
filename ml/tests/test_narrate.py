"""narrate.narrate() looks up TEMPLATES by the same type strings
priors.PRIORS is keyed on; a KeyError in production means one drifted
from the other."""

from vtml.fusion import narrate
from vtml.priors import PRIORS


def test_every_prior_has_a_narrative_template() -> None:
    assert PRIORS.keys() == narrate.TEMPLATES.keys()


def test_every_template_formats_with_and_without_corroboration() -> None:
    for type_ in narrate.TEMPLATES:
        assert narrate.narrate(type_, 1500, []) != ""
        assert "corroborated by" in narrate.narrate(type_, 1500, [narrate.Channel.SCENE])
