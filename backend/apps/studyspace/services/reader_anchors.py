"""Stable block ids shared by every converter.

Annotations point at these ids, so the rule that matters is not which converter
produced a block but that the same text always yields the same anchor.
"""

import hashlib
from collections import Counter

ANCHOR_PREFIX = "b-"
ANCHOR_DIGEST_LENGTH = 10


class BlockAnchors:
    """Assigns an id to every block a reader can point at.

    The id is derived from the block's own text rather than its position, so
    re-converting the same source yields the same anchors and a highlight saved
    months ago still resolves. Position-based ids would shift the moment the
    extraction pipeline classified one block differently.

    Blocks whose text is genuinely identical are disambiguated by order of
    appearance, which is the one case where an anchor can still move: inserting
    a duplicate ahead of an existing one renumbers the ones that follow.
    """

    def __init__(self):
        self._occurrences = Counter()
        self.page_number = 0

    def assign(self, text: str) -> str | None:
        """Anchor for a block's text, or None when the block carries none."""
        normalised = " ".join(text.split())
        if not normalised:
            return None

        digest = hashlib.sha1(normalised.encode("utf-8")).hexdigest()[
            :ANCHOR_DIGEST_LENGTH
        ]
        self._occurrences[digest] += 1
        occurrence = self._occurrences[digest]

        # The prefix keeps the id from starting with a digit, which would need
        # escaping every time it was used as a CSS selector.
        if occurrence == 1:
            return f"{ANCHOR_PREFIX}{digest}"
        return f"{ANCHOR_PREFIX}{digest}-{occurrence}"
