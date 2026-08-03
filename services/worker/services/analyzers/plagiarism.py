"""
Plagiarism / uniqueness checker — heuristik phrase-fingerprinting.

Tanpa web index: n-gram teks dibandingkan dengan daftar frasa umum internet
(COMMON_PHRASES). BUKAN plagiarism detector beneran — FE wajib menampilkan
disclaimer.
"""

import difflib
import logging
import re
from core.provider import Provider

logger = logging.getLogger(__name__)

_SIMILARITY_THRESHOLD = 0.7
_JACCARD_PREFILTER = 0.5

# ~200 frasa/kalimat klise yang sangat umum di internet (lowercase)
COMMON_PHRASES = [
    "at the end of the day",
    "in this day and age",
    "the fact of the matter is",
    "when it comes to",
    "in the world of",
    "it goes without saying that",
    "last but not least",
    "first and foremost",
    "the rest is history",
    "easier said than done",
    "in the blink of an eye",
    "a blessing in disguise",
    "the tip of the iceberg",
    "a double edged sword",
    "thinking outside the box",
    "pushing the envelope",
    "the best of both worlds",
    "a win win situation",
    "at the drop of a hat",
    "back to the drawing board",
    "the ball is in your court",
    "barking up the wrong tree",
    "beat around the bush",
    "the benefit of the doubt",
    "the calm before the storm",
    "caught between a rock and a hard place",
    "a chip on your shoulder",
    "comparing apples to oranges",
    "cut to the chase",
    "the devil is in the details",
    "down to the wire",
    "the elephant in the room",
    "every cloud has a silver lining",
    "go the extra mile",
    "hit the nail on the head",
    "in the heat of the moment",
    "it is not rocket science",
    "kill two birds with one stone",
    "the last straw",
    "left out in the cold",
    "let the cat out of the bag",
    "light at the end of the tunnel",
    "a method to the madness",
    "miss the boat",
    "on the same page",
    "once in a blue moon",
    "a piece of cake",
    "pull yourself together",
    "see eye to eye",
    "sit on the fence",
    "speak of the devil",
    "take it with a grain of salt",
    "the whole nine yards",
    "through thick and thin",
    "time flies when you are having fun",
    "under the weather",
    "your guess is as good as mine",
    "actions speak louder than words",
    "all that glitters is not gold",
    "better late than never",
    "birds of a feather flock together",
    "cleanliness is next to godliness",
    "do not count your chickens before they hatch",
    "do not put all your eggs in one basket",
    "the early bird catches the worm",
    "every dog has its day",
    "familiarity breeds contempt",
    "fortune favors the bold",
    "honesty is the best policy",
    "if it is not broken do not fix it",
    "ignorance is bliss",
    "it takes two to tango",
    "knowledge is power",
    "laughter is the best medicine",
    "necessity is the mother of invention",
    "no pain no gain",
    "practice makes perfect",
    "the pen is mightier than the sword",
    "rome was not built in a day",
    "slow and steady wins the race",
    "the grass is always greener on the other side",
    "there is no place like home",
    "time heals all wounds",
    "two heads are better than one",
    "when in rome do as the romans do",
    "where there is a will there is a way",
    "you cannot judge a book by its cover",
    "you cannot have your cake and eat it too",
    "a journey of a thousand miles begins with a single step",
    "absence makes the heart grow fonder",
    "an apple a day keeps the doctor away",
    "beauty is in the eye of the beholder",
    "a picture is worth a thousand words",
    "the apple does not fall far from the tree",
    "do not bite the hand that feeds you",
    "do not judge a man until you have walked a mile in his shoes",
    "give credit where credit is due",
    "good things come to those who wait",
    "history repeats itself",
    "hope for the best prepare for the worst",
    "if you cannot beat them join them",
    "it is always darkest before the dawn",
    "it is better to give than to receive",
    "look before you leap",
    "money does not grow on trees",
    "never look a gift horse in the mouth",
    "old habits die hard",
    "one man's trash is another man's treasure",
    "out of sight out of mind",
    "people who live in glass houses should not throw stones",
    "the proof is in the pudding",
    "strike while the iron is hot",
    "there is no smoke without fire",
    "too many cooks spoil the broth",
    "you reap what you sow",
    "lorem ipsum dolor sit amet",
    "consectetur adipiscing elit",
    "sed do eiusmod tempor incididunt",
    "to whom it may concern",
    "i hope this email finds you well",
    "thank you for your time and consideration",
    "please do not hesitate to contact me",
    "i look forward to hearing from you",
    "as per my previous email",
    "please find attached",
    "best regards and kind regards",
    "to be or not to be that is the question",
    "all the world is a stage",
    "the quick brown fox jumps over the lazy dog",
    "four score and seven years ago",
    "i have a dream that one day",
    "ask not what your country can do for you",
    "that is one small step for man",
    "elementary my dear watson",
    "may the force be with you",
    "houston we have a problem",
    "frankly my dear i do not give a damn",
    "in today's fast paced world",
    "in today's digital age",
    "in the modern era of technology",
    "now more than ever before",
    "the world is changing rapidly",
    "technology has revolutionized the way we live",
    "the internet has changed everything",
    "social media has become an integral part of our lives",
    "artificial intelligence is transforming industries",
    "data is the new oil",
    "content is king",
    "the customer is always right",
    "quality over quantity",
    "less is more",
    "practice what you preach",
    "lead by example",
    "think globally act locally",
    "work smarter not harder",
    "teamwork makes the dream work",
    "there is no i in team",
    "failure is not an option",
    "success is a journey not a destination",
    "the sky is the limit",
    "dream big and dare to fail",
    "believe you can and you are halfway there",
    "be the change you wish to see in the world",
    "the only constant in life is change",
    "everything happens for a reason",
    "what does not kill you makes you stronger",
    "life is what happens when you are busy making other plans",
    "the journey of self discovery",
    "stepping out of your comfort zone",
    "unlock your full potential",
    "take your skills to the next level",
    "a game changer in the industry",
    "state of the art technology",
    "cutting edge innovation",
    "best practices in the industry",
    "a one stop shop for all your needs",
    "customer satisfaction is our top priority",
    "we go above and beyond",
    "exceeding expectations every time",
    "your one stop solution",
    "terms and conditions apply",
    "results may vary",
    "consult your doctor before use",
    "no animals were harmed in the making",
    "based on a true story",
    "in a galaxy far far away",
    "once upon a time in a land far away",
    "and they lived happily ever after",
    "the moral of the story is",
    "to make a long story short",
    "needless to say",
    "as a matter of fact",
    "for all intents and purposes",
    "with all due respect",
    "at this moment in time",
    "in the grand scheme of things",
    "the bottom line is",
    "when all is said and done",
    "the powers that be",
    "few and far between",
    "par for the course",
    "by the same token",
    "in the long run",
    "the path of least resistance",
]

_phrase_words_cache: list[tuple[str, frozenset[str], int]] | None = None


def _phrase_index() -> list[tuple[str, frozenset[str], int]]:
    global _phrase_words_cache
    if _phrase_words_cache is None:
        _phrase_words_cache = [
            (p, frozenset(p.split()), len(p.split())) for p in COMMON_PHRASES
        ]
    return _phrase_words_cache


def _word_spans(text: str) -> list[tuple[str, int, int]]:
    """(kata-lowercase, start, end) untuk tiap kata di teks."""
    return [(m.group(0).lower(), m.start(), m.end()) for m in re.finditer(r"[A-Za-z']+", text)]


def _label(score: int) -> str:
    if score > 85:
        return "Unique"
    if score > 70:
        return "Likely Original"
    if score > 50:
        return "Possible Match"
    return "High Similarity"


def run_plagiarism(text: str, provider: Provider | None = None) -> dict:
    """
    Analisis murni heuristik — `provider` diterima agar tanda tangannya seragam
    dengan analyzer lain, tapi tidak dipakai sama sekali.

    Returns PlagiarismResult:
    {
      uniqueness_score: int,
      label: str,
      flagged_phrases: [{text, offset, length, similarity}]
    }
    """
    spans = _word_spans(text)
    flagged: list[dict] = []
    flagged_ranges: list[tuple[int, int]] = []

    for phrase, phrase_set, n_words in _phrase_index():
        if n_words < 4 or n_words > len(spans):
            continue
        # window seukuran frasa, geser per kata
        i = 0
        while i + n_words <= len(spans):
            window = spans[i:i + n_words]
            window_words = frozenset(w for w, _, _ in window)
            # prefilter murah: overlap kata harus cukup tinggi
            inter = len(phrase_set & window_words)
            union = len(phrase_set | window_words)
            if union == 0 or inter / union < _JACCARD_PREFILTER:
                i += 1
                continue
            window_text = " ".join(w for w, _, _ in window)
            similarity = difflib.SequenceMatcher(None, phrase, window_text).ratio()
            if similarity >= _SIMILARITY_THRESHOLD:
                start = window[0][1]
                end = window[-1][2]
                # skip kalau overlap dengan yang sudah ke-flag
                if not any(s < end and start < e for s, e in flagged_ranges):
                    flagged.append({
                        "text": text[start:end],
                        "offset": start,
                        "length": end - start,
                        "similarity": round(similarity, 2),
                    })
                    flagged_ranges.append((start, end))
                i += n_words  # lompat melewati match
                continue
            i += 1

    total_chars = len(text) or 1
    flagged_chars = sum(f["length"] for f in flagged)
    uniqueness = max(0, min(100, 100 - round(flagged_chars / total_chars * 100)))

    flagged.sort(key=lambda f: -f["similarity"])
    logger.info("[plagiarism] %d frasa ke-flag, uniqueness=%d", len(flagged), uniqueness)

    return {
        "uniqueness_score": uniqueness,
        "label": _label(uniqueness),
        "flagged_phrases": flagged,
    }
