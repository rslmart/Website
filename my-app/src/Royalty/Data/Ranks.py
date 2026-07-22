"""Rank scoring for royalty/nobility.

Assigns each person a numeric rank tier so the house/family view can prune to
the important members (monarchs and high nobles) and hide the long tail of minor
relatives. Ranks in Wikidata are messy: `occupation` (P106) is a coarse
controlled vocabulary dominated by "aristocrat", `noble title` (P97) is often
empty, and `position held` (P39) uses thousands of per-territory items. The
specific rank (Duke vs Count vs Prince) therefore lives mostly in free text.

Approach (heuristic + curated):
  - A curated QID -> tier map (`CURATED_TIER`) pins the generic rank items and a
    few high-value titles precisely.
  - A keyword table (`KEYWORD_TIER`) parses the English text of occupation,
    position/noble-title labels, and the person's own label + description.
`rank_tier` takes the MAX tier across every signal.

Note: this runs over the combined, *labelled* data (monarchy_data.json), where
`occupation` is a list of label strings and `position held` / `noble title` are
lists of {id, label}. So curated QIDs are matched against the position/title ids
that survive labelling, while occupation is matched by text.
"""
import re

# Ordered high -> low. Names are informational; the number is what matters.
TIER_EMPEROR = 6
TIER_KING = 5
TIER_GRAND_DUKE = 4
TIER_DUKE = 3
TIER_PRINCE = 2
TIER_COUNT = 1
TIER_OTHER = 0

TIER_NAMES = {
    TIER_EMPEROR: "Emperor",
    TIER_KING: "King / Monarch",
    TIER_GRAND_DUKE: "Grand Duke / Archduke / Khan",
    TIER_DUKE: "Duke",
    TIER_PRINCE: "Prince / Margrave",
    TIER_COUNT: "Count / Baron",
    TIER_OTHER: "Other",
}

# Curated Wikidata items -> tier. These are the generic rank/occupation items
# (which also appear as position-held ids in practice) plus a few high-value
# titles, so they score correctly even if the text is ambiguous or absent.
CURATED_TIER = {
    # Emperor
    "Q39018": TIER_EMPEROR,    # emperor
    "Q181765": TIER_EMPEROR,   # Holy Roman Emperor
    # King / Monarch / sovereign
    "Q116": TIER_KING,         # monarch
    "Q12097": TIER_KING,       # king
    "Q16511993": TIER_KING,    # queen
    "Q19643": TIER_KING,       # queen regnant
    "Q2304859": TIER_KING,     # sovereign
    "Q1097498": TIER_KING,     # ruler
    "Q782985": TIER_KING,      # King of the Romans
    "Q43292": TIER_KING,       # sultan
    "Q37110": TIER_KING,       # pharaoh
    # Grand duke / archduke / grand prince / elector / khan
    "Q154615": TIER_GRAND_DUKE,   # archduke
    "Q205706": TIER_GRAND_DUKE,   # grand duke
    "Q1549319": TIER_GRAND_DUKE,  # grand prince
    "Q22722": TIER_GRAND_DUKE,    # prince-elector
    "Q181888": TIER_GRAND_DUKE,   # khan
    # Duke
    "Q166886": TIER_DUKE,      # duke
    "Q4593319": TIER_DUKE,     # duchess
    # Prince / margrave / landgrave / marquess / count palatine
    "Q2747456": TIER_PRINCE,   # prince
    "Q863048": TIER_PRINCE,    # princess
    "Q157802": TIER_PRINCE,    # margrave
    "Q841633": TIER_PRINCE,    # landgrave
    "Q209726": TIER_PRINCE,    # marquess
    "Q22932": TIER_PRINCE,     # count palatine
    # Count / earl / viscount / baron / lord
    "Q3519259": TIER_COUNT,    # count
    "Q1128240": TIER_COUNT,    # earl
    "Q185902": TIER_COUNT,     # viscount
    "Q165503": TIER_COUNT,     # baron
    "Q12552047": TIER_COUNT,   # lord
    "Q1409420": TIER_COUNT,    # feudatory
    # Consorts / generic: not sovereigns; the bloodline connector logic pulls
    # them in as ancestors when needed, so they don't need a high tier.
    "Q719039": TIER_COUNT,     # queen consort
    "Q2000200": TIER_COUNT,    # king consort
    "Q5784340": TIER_COUNT,    # consort
}

# Keyword -> tier, checked high to low. Word-boundary anchored to avoid matches
# like "kingdom" (king) or "country" (count). "grand duke"/"archduke" are listed
# above plain "duke" but since we take the max tier, order is not load-bearing.
_KEYWORD_TIER_RAW = [
    (TIER_EMPEROR, ["emperor", "empress", "kaiser", "tsar", "tsarina",
                    "czar", "padishah"]),
    (TIER_KING, ["king", "queen", "monarch", "sovereign", "pharaoh",
                 "sultan", "sultana", "shah", "caliph", "high king", "ruler"]),
    (TIER_GRAND_DUKE, ["archduke", "archduchess", "grand duke", "grand duchess",
                       "grand prince", "grand princess", "elector",
                       "prince-elector", "khan", "despot"]),
    (TIER_DUKE, ["duke", "duchess", "doge", "prince-bishop",
                 "prince-archbishop"]),
    (TIER_PRINCE, ["margrave", "margravine", "landgrave", "marquess", "marquis",
                   "marchioness", "count palatine", "palatine", "prince",
                   "princess"]),
    (TIER_COUNT, ["count", "countess", "earl", "viscount", "baron", "baroness",
                  "lord", "lady", "seigneur", "castellan"]),
]

# Precompile: (tier, compiled_regex) with all a tier's keywords in one alternation.
_KEYWORD_PATTERNS = [
    (tier, re.compile(r"\b(?:" + "|".join(re.escape(k) for k in kws) + r")\b"))
    for tier, kws in _KEYWORD_TIER_RAW
]
_CONSORT_RE = re.compile(r"\bconsort\b")


def _text_tier(text):
    """Highest tier implied by a chunk of free text (occupation/title/label)."""
    if not text:
        return TIER_OTHER
    t = text.lower()
    best = TIER_OTHER
    for tier, pattern in _KEYWORD_PATTERNS:
        if pattern.search(t):
            best = max(best, tier)
    # A "queen consort" / "empress consort" is not a reigning monarch; cap so the
    # king/queen/emperor keyword doesn't over-promote consorts (regnants come via
    # "queen regnant" / the monarch list instead).
    if best > TIER_COUNT and _CONSORT_RE.search(t):
        return TIER_COUNT
    return best


def rank_tier(person):
    """Max rank tier for a person across every available signal.

    Expects a labelled person record (as in monarchy_data.json).
    """
    best = TIER_OTHER

    for key in ("position held", "noble title"):
        for item in person.get(key, []) or []:
            if not isinstance(item, dict):
                continue
            qid = item.get("id")
            if qid in CURATED_TIER:
                best = max(best, CURATED_TIER[qid])
            best = max(best, _text_tier(item.get("label")))

    for occ in person.get("occupation", []) or []:
        if isinstance(occ, str):
            best = max(best, _text_tier(occ))
        elif isinstance(occ, dict):
            if occ.get("id") in CURATED_TIER:
                best = max(best, CURATED_TIER[occ["id"]])
            best = max(best, _text_tier(occ.get("label")))

    for key in ("label", "description"):
        best = max(best, _text_tier(person.get(key)))

    return best
