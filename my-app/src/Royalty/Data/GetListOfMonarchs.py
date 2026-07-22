import requests
from bs4 import BeautifulSoup
import json
import os
import re
import utils


def flatten(l):
    return [item for sublist in l for item in sublist]


def get_monarch_list(url, div_name, td_classes, name_filter={}):
    response = requests.get(url=url)
    soup = BeautifulSoup(response.content, 'html.parser')
    div_element = soup.find('div', attrs={'aria-labelledby': div_name})
    td_elements = div_element.find_all('td', attrs={'class': td_classes})
    li_tags = flatten([td_element.find_all('li') for td_element in td_elements])
    a_tags = flatten([li_tag.find_all(lambda tag: tag.name == 'a' and not tag.find_parents('i')) for li_tag in li_tags])
    monarchs = [a_tag.get('href') for a_tag in a_tags]
    wiki_list = [x for i, x in enumerate(monarchs) if x not in monarchs[:i]]
    wiki_data_list = convert_wiki_list_to_wiki_data_list(wiki_list, name_filter=name_filter)
    return wiki_data_list

def get_monarch_list_with_i(url, div_name, td_classes, name_filter={}):
    response = requests.get(url=url)
    soup = BeautifulSoup(response.content, 'html.parser')
    div_element = soup.find('div', attrs={'aria-labelledby': div_name})
    td_elements = div_element.find_all('td', attrs={'class': td_classes})
    li_tags = flatten([td_element.find_all('li') for td_element in td_elements])
    a_tags = flatten([li_tag.find_all(lambda tag: tag.name == 'a') for li_tag in li_tags])
    monarchs = [a_tag.get('href') for a_tag in a_tags]
    wiki_list = [x for i, x in enumerate(monarchs) if x not in monarchs[:i]]
    wiki_data_list = convert_wiki_list_to_wiki_data_list(wiki_list, name_filter=name_filter)
    return wiki_data_list


def convert_wiki_list_to_wiki_data_list(wiki_list, name_filter={}):
    wiki_data_list = []
    print("Converting: {} {}".format(len(wiki_list), wiki_list))
    for monarch in wiki_list:
        if monarch not in name_filter and monarch.startswith('/wiki/'):
            response = requests.get(
                url="https://en.wikipedia.org" + monarch
            )
            soup = BeautifulSoup(response.content, 'html.parser')
            li_tag = soup.find('li', attrs={'id': 't-wikibase'})
            wiki_data_url = li_tag.find('a').get('href')
            pattern = r'/([A-Z]\d+)$'
            wiki_data_id = re.search(pattern, wiki_data_url).group(1)
            if wiki_data_id not in wiki_data_list:
                wiki_data_list.append(wiki_data_id)
    wiki_data = utils.get_wikidata_data_for_list(wiki_data_list)
    wiki_data_list = [w for w in wiki_data_list if wiki_data[w]['claims']['P31'][0]['mainsnak']['datavalue']['value']['id'] == 'Q5']
    return wiki_data_list


# ---------------------------------------------------------------------------
# Robust scraper for additional monarchies (2024+ Parsoid HTML).
#
# The legacy get_monarch_list() helpers above assume the old MediaWiki HTML:
# relative "/wiki/Foo" hrefs and a "t-wikibase" sidebar link on every article.
# Wikipedia now serves Parsoid HTML with ABSOLUTE hrefs
# ("https://en.wikipedia.org/wiki/Foo", rel="mw:WikiLink") and the sidebar is
# not always present, which silently breaks the legacy path.
#
# This scraper instead: (1) extracts page titles from a navbox / wikitables /
# a section list, then (2) resolves those titles to Wikidata Q-IDs via the
# MediaWiki pageprops API (which follows redirects), and (3) keeps only humans
# (P31 = Q5). Everything is title-based, so it is robust to absolute vs
# relative hrefs and to page redirects.
# ---------------------------------------------------------------------------

_SCRAPER_UA = {"User-Agent": "RoyaltyTreeBot/1.0 (personal genealogy chart project)"}

# Ancient king lists link a handful of classical chroniclers who are humans
# (Q5) but obviously not pharaohs; drop them so they don't pollute the list.
EGYPT_BLOCKLIST = frozenset({
    "Manetho", "Eusebius", "Sextus_Julius_Africanus", "Herodotus",
    "Diodorus_Siculus", "Africanus", "Josephus",
})

# Kingdom/period groupings used to bucket the single List_of_pharaohs page.
_EGYPT_PERIODS = [
    "Early Dynastic", "Old Kingdom", "First Intermediate", "Middle Kingdom",
    "Second Intermediate", "New Kingdom", "Third Intermediate", "Late Period",
    "Ptolemaic",
]


def _title_from_href(href):
    """Page title from a relative or absolute wiki href, or None for non-articles."""
    if not href or "/wiki/" not in href:
        return None
    title = href.split("/wiki/")[-1].split("?")[0].split("#")[0]
    if not title or ":" in title:  # ":" excludes File:/Template:/Special:/etc.
        return None
    return title


def _get_soup(url):
    return BeautifulSoup(requests.get(url, headers=_SCRAPER_UA, timeout=30).content, "html.parser")


def _ordered_unique(seq):
    out = []
    for x in seq:
        if x not in out:
            out.append(x)
    return out


def _links_from_navbox(soup, anchor_prefix):
    """Ordered titles from a navbox, matched by aria-labelledby prefix (the
    numeric suffix Wikipedia appends is volatile, so we match on the prefix)."""
    div = None
    for d in soup.find_all("div", attrs={"aria-labelledby": True}):
        if d["aria-labelledby"].startswith(anchor_prefix):
            div = d
            break
    if div is None:
        raise ValueError(f"navbox with anchor prefix '{anchor_prefix}' not found")
    titles = []
    for li in div.find_all("li"):
        a = li.find("a", href=True)
        if a:
            t = _title_from_href(a["href"])
            if t:
                titles.append(t)
    return _ordered_unique(titles)


def _first_link_in_row(tr):
    for a in tr.find_all("a", href=True):
        t = _title_from_href(a["href"])
        if t:
            return t
    return None


def _links_from_tables(soup, indices=None):
    """First person-like link in each row (skips leading portrait/File cells)."""
    tables = soup.find_all("table", class_="wikitable")
    if indices is not None:
        tables = [tables[i] for i in indices if i < len(tables)]
    titles = []
    for table in tables:
        for tr in table.find_all("tr"):
            t = _first_link_in_row(tr)
            if t:
                titles.append(t)
    return _ordered_unique(titles)


def _links_from_heading_list(soup, keyword):
    """Ordered titles from the first <ul>/<table> following a heading that
    contains `keyword` (used for the per-khanate sections on the Mongol page)."""
    for h in soup.find_all(["h2", "h3", "h4"]):
        if keyword.lower() in h.get_text().lower():
            container = h.find_next(["ul", "table"])
            if container is not None:
                titles = [_title_from_href(a["href"]) for a in container.find_all("a", href=True)]
                return _ordered_unique([t for t in titles if t])
    raise ValueError(f"heading containing '{keyword}' not found")


def _links_from_egypt_period(soup, period):
    """Bucket List_of_pharaohs wikitables by the kingdom/period heading they
    fall under, returning the pharaohs for a single period."""
    current = None
    titles = []
    for el in soup.find_all(["h2", "h3", "table"]):
        if el.name in ("h2", "h3"):
            text = el.get_text()
            for p in _EGYPT_PERIODS:
                if p.lower() in text.lower():
                    current = p
                    break
        elif el.name == "table" and "wikitable" in (el.get("class") or []) and current == period:
            for tr in el.find_all("tr"):
                t = _first_link_in_row(tr)
                if t:
                    titles.append(t)
    return _ordered_unique(titles)


def _resolve_titles_to_qids(titles):
    """Map ordered enwiki titles to Wikidata Q-IDs via pageprops (follows
    redirects). Preserves order and drops duplicates/unresolved titles."""
    qids = []
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query", "format": "json", "prop": "pageprops",
                "ppprop": "wikibase_item", "redirects": 1, "titles": "|".join(batch),
            },
            headers=_SCRAPER_UA, timeout=30,
        ).json()
        query = resp.get("query", {})
        norm = {n["from"]: n["to"] for n in query.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in query.get("redirects", [])}
        by_title = {p.get("title"): p.get("pageprops", {}).get("wikibase_item")
                    for p in query.get("pages", {}).values()}
        for t in batch:
            key = t.replace("_", " ")
            key = norm.get(key, key)
            key = redir.get(key, key)
            qid = by_title.get(key)
            if qid:
                qids.append(qid)
    return _ordered_unique(qids)


def _keep_humans(qids):
    """Keep only Q-IDs whose instance-of (P31) includes human (Q5)."""
    data = utils.get_wikidata_data_for_list(qids)
    humans = []
    for q in qids:
        entity = data.get(q)
        if not entity:
            continue
        try:
            p31 = [c["mainsnak"]["datavalue"]["value"]["id"] for c in entity["claims"].get("P31", [])]
        except (KeyError, TypeError):
            p31 = []
        if "Q5" in p31:
            humans.append(q)
    return humans


def scrape_monarchy(url, strategy, param=None, blocklist=frozenset(), stop_after=None):
    """Scrape an ordered, humans-only list of Wikidata Q-IDs for a monarchy.

    strategy: "navbox" (param=anchor prefix), "tables" (param=list of table
    indices, or None for all wikitables), "heading" (param=heading keyword),
    or "egypt" (param=kingdom/period name).
    stop_after: optional title to truncate the list after (inclusive).
    """
    soup = _get_soup(url)
    if strategy == "navbox":
        titles = _links_from_navbox(soup, param)
    elif strategy == "tables":
        titles = _links_from_tables(soup, param)
    elif strategy == "heading":
        titles = _links_from_heading_list(soup, param)
    elif strategy == "egypt":
        titles = _links_from_egypt_period(soup, param)
    else:
        raise ValueError(f"unknown strategy: {strategy}")

    titles = [t for t in titles if t not in blocklist]
    if stop_after and stop_after in titles:
        titles = titles[: titles.index(stop_after) + 1]

    qids = _resolve_titles_to_qids(titles)
    qids = _keep_humans(qids)
    print(f"scrape_monarchy({url}, {strategy}, {param}) -> {len(qids)} humans")
    return qids


def build_chinggisids():
    """Union of the Genghisid empires into one 'descendants of Genghis' tree.

    The per-empire succession lists are concatenated (Genghis first); the
    downstream tree build links each khanate founder to Genghis via father
    edges, so the branches all hang off the common root."""
    with open("data/monarch_list.json") as json_file:
        monarch_lists = json.load(json_file)
    order = ["Mongol_Empire", "Yuan", "Golden_Horde", "Ilkhanate", "Chagatai_Khanate", "Mughal"]
    union = []
    for m in order:
        union.extend(monarch_lists.get(m, []))
    union = _ordered_unique(union)
    if "Q720" not in union:  # Genghis Khan
        union.insert(0, "Q720")
    elif union[0] != "Q720":
        union.remove("Q720")
        union.insert(0, "Q720")
    saveData("Chinggisids", union)


def saveData(list_name, monarch_list):
    print("Saving Data: {} {}".format(list_name, len(monarch_list)))
    file_path = 'data/monarch_list.json'
    if not os.path.exists(file_path):
        data = {}
    else:
        # Open the JSON file and load its content into a Python object
        with open(file_path, 'r') as file:
            data = json.load(file)
    data[list_name] = monarch_list
    # Convert dictionary to JSON string using the custom encoder
    json_data = json.dumps(data, indent=4)
    # Write JSON data to a file
    with open(file_path, "w") as file:
        file.write(json_data)

def get_monarch_lists(monarchies):
    if "England" in monarchies:
        # Kings of England
        response = requests.get(
            url="https://en.wikipedia.org/wiki/List_of_English_monarchs",
        )
        soup = BeautifulSoup(response.content, 'html.parser')
        div_element = soup.find('div', attrs={'aria-labelledby': "English,_Scottish_and_British_monarchs189"})
        td_element = div_element.find(lambda tag: tag.name == 'td' and tag['class'] == ['navbox-list'])
        li_tags = td_element.find_all('li')
        kings_of_england = [li_tag.find('a').get('href') for li_tag in li_tags if li_tag.find('a')]
        td_elements = div_element.find('td', attrs={'class': "navbox-list navbox-even hlist"})
        li_tags = td_elements.find_all('li')
        td_elements = div_element.find('td', attrs={'class': "navbox-list navbox-odd hlist"})
        li_tags = li_tags + td_elements.find_all('li')
        kings_of_england = kings_of_england + [li_tag.find('a').get('href') for li_tag in li_tags if li_tag.find('a')]
        kings_of_england = [x for i, x in enumerate(kings_of_england) if x not in kings_of_england[:i]]
        kings_of_england = convert_wiki_list_to_wiki_data_list(kings_of_england, name_filter={'/wiki/Oliver_Cromwell',
                                                                                              '/wiki/Richard_Cromwell'})
        saveData('England', kings_of_england)
    if "France" in monarchies:
        # Kings of France
        saveData('France',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_French_monarchs", 'Monarchs_of_France759',
                                  ['navbox-list-with-group', 'navbox-list', 'hlist']))
    if "Holy_Roman_Empire" in monarchies:
        # Holy Roman Emperors
        saveData('Holy_Roman_Empire',
                 get_monarch_list("https://en.wikipedia.org/wiki/Holy_Roman_Emperor", 'Holy_Roman_emperors164',
                                  ['navbox-list', 'hlist']))

    if "Germany" in monarchies:
        # German Kings
        saveData('Germany', get_monarch_list("https://en.wikipedia.org/wiki/List_of_German_monarchs", 'Monarchs_of_Germany547',
                                             ['navbox-list-with-group', 'navbox-list', 'hlist']))

    if "Spain" in monarchies:
        kings_of_asturias = get_monarch_list("https://en.wikipedia.org/wiki/Kingdom_of_Asturias",
                                         'Monarchs_of_Asturias74', ['navbox-list-with-group', 'navbox-list', 'hlist'])[:-2]
        kings_of_leon = get_monarch_list("https://en.wikipedia.org/wiki/Kingdom_of_Le%C3%B3n",
                                          'Monarchs_of_León226', ['navbox-list-with-group', 'navbox-list', 'hlist'])[:-5]
        kings_of_spain = get_monarch_list("https://en.wikipedia.org/wiki/List_of_Spanish_monarchs", 'Monarchs_of_Spain279', ['navbox-list-with-group', 'navbox-list', 'hlist'])
        kings_of_spain.remove("Q7726")
        saveData('Spain', kings_of_asturias + kings_of_leon + kings_of_spain)

    if "Russia" in monarchies:
        # Russian Monarchs
        saveData('Russia',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_Russian_monarchs", 'List_of_Russian_monarchs206',
                                  ['navbox-list-with-group', 'navbox-list', 'hlist']))
    if "Sweden" in monarchies:
        # Swedish Monarchs
        saveData('Sweden', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Swedish_monarchs", 'Monarchs_of_Sweden1274',
                                            ['navbox-list-with-group', 'navbox-list']))
    if "Denmark" in monarchies:
        # Danish Monarchs
        saveData('Denmark', get_monarch_list_with_i("https://en.wikipedia.org/wiki/List_of_Danish_monarchs", 'Monarchs_of_Denmark885',
                                             ['navbox-list-with-group', 'navbox-list']))
    if "Scotland" in monarchies:
        # Scottish Monarchs
        saveData('Scotland', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Scottish_monarchs",
                                              'Pictish_and_Scottish_monarchs338', ['navbox-list-with-group', 'navbox-list']))
    if "Norway" in monarchies:
        # Norwegian Monarchs
        saveData('Norway',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_Norwegian_monarchs", 'Monarchs_of_Norway867',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Iceland" in monarchies:
        # Icelanic Monarchs
        saveData('Iceland',
                 get_monarch_list("https://en.wikipedia.org/wiki/Lists_of_heads_of_state_of_Iceland", 'Monarchs_of_Iceland177',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Bohemia" in monarchies:
        # List_of_Bohemian_monarchs
        saveData('Bohemia',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_Bohemian_monarchs", 'Monarchs_of_Bohemia1205',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Austria" in monarchies:
        # List_of_rulers_of_Austria
        saveData('Austria',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_rulers_of_Austria", 'Monarchs_of_Austria247',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Hungary" in monarchies:
        # List_of_Hungarian_monarchs
        saveData('Hungary',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_Hungarian_monarchs", 'Monarchs_of_Hungary522',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Naples" in monarchies:
        # List_of_monarchs_of_Naples
        saveData('Naples',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_monarchs_of_Naples", 'Monarchs_of_Naples136',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Portugal" in monarchies:
        # List_of_Portuguese_monarchs
        saveData('Portugal',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_Portuguese_monarchs", 'Monarchs_of_Portugal284',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Poland" in monarchies:
        # List_of_Polish_monarchs
        saveData('Poland',
                 get_monarch_list("https://en.wikipedia.org/wiki/List_of_Polish_monarchs", 'Monarchs_of_Poland721',
                                  ['navbox-list-with-group', 'navbox-list']))
    if "Bavaria" in monarchies:
        # Bavarian Monarchs
        response = requests.get(
            url="https://en.wikipedia.org/wiki/List_of_monarchs_of_Bavaria",
        )
        soup = BeautifulSoup(response.content, 'html.parser')
        tr_tags = soup.find_all('tr')
        td_tags = []
        for tr_tag in tr_tags:
            temp = tr_tag.find_all('td')
            if len(temp) >= 1:
                td_tags.append(temp[0])
        bavarian_monarchs = []
        for td_tag in td_tags:
            a_tag = td_tag.find('a')
            if a_tag:
                href = a_tag.get('href')
                bavarian_monarchs.append(href)
            else:
                b_tags = td_tag.find_all('b')
                for b_tag in b_tags:
                    a_tag = b_tag.find('a')
                    if a_tag:
                        href = a_tag.get('href')
                        bavarian_monarchs.append(href)
        bavarian_monarchs = [h for h in bavarian_monarchs if
                             h.startswith('/wiki/') and not h.startswith('/wiki/File:') and not h.startswith('/wiki/Pope')][
                            :-18]
        bavarian_monarchs = [x for i, x in enumerate(bavarian_monarchs) if x not in bavarian_monarchs[:i]]
        bavarian_monarchs = convert_wiki_list_to_wiki_data_list(bavarian_monarchs)
        saveData('Bavaria', bavarian_monarchs)
    if "Japan" in monarchies:
        saveData('Japan', get_monarch_list("https://en.wikipedia.org/wiki/Emperor_of_Japan",
                                           "23x15px&#124;border&#124;link=Japan&#124;alt=Japan_Emperors_of_Japan_(list)1115",
                                           ['navbox-list', 'hlist']))
    if "Joseon" in monarchies:
        # Korean Monarchs
        response = requests.get(
            url="https://en.wikipedia.org/wiki/List_of_kings_of_Joseon",
        )
        soup = BeautifulSoup(response.content, 'html.parser')
        table = soup.find('table')
        th = table.find_all('th', attrs={'scope': 'row'})
        links = []
        for t in th:
            links = links + [a.get('href') for a in t.find_all('a')]
        joseon_monarchs = convert_wiki_list_to_wiki_data_list(links)
        saveData('Joseon', joseon_monarchs)
    if "Shang" in monarchies:
       saveData('Shang', get_monarch_list("https://en.wikipedia.org/wiki/Shang_dynasty",
                                           "Kings_of_the_Shang_dynasty1551",
                                           ['navbox-list', 'hlist'])[3:])
    if "Zhou" in monarchies:
       saveData('Zhou', get_monarch_list("https://en.wikipedia.org/wiki/Zhou_dynasty",
                                           "Kings_of_the_Zhou_dynasty1116",
                                           ['navbox-list', 'hlist']))
    if "Han" in monarchies:
       saveData('Han', get_monarch_list("https://en.wikipedia.org/wiki/List_of_emperors_of_the_Han_dynasty",
                                           "Emperors_of_the_Han_dynasty1153",
                                           ['navbox-list', 'hlist']))
    if "Tang" in monarchies:
       saveData('Tang', get_monarch_list("https://en.wikipedia.org/wiki/Template:Tang_emperors",
                                           "Emperors_of_the_Tang_dynasty1055",
                                           ['navbox-list', 'hlist']))
    if "Yuan" in monarchies:
       saveData('Yuan', get_monarch_list("https://en.wikipedia.org/wiki/Template:Yuan_emperors",
                                           "Emperors_of_the_Yuan_dynasty1679",
                                           ['navbox-list', 'hlist']))
    if "Ming" in monarchies:
       saveData('Ming', get_monarch_list("https://en.wikipedia.org/wiki/Template:Ming_emperors",
                                           "Emperors_of_the_Ming_dynasty1093",
                                           ['navbox-list', 'hlist']))
    if "Qing" in monarchies:
       saveData('Qing', get_monarch_list("https://en.wikipedia.org/wiki/Template:Qing_emperors",
                                           "Emperors_of_the_Qing_dynasty1059",
                                           ['navbox-list', 'hlist']))
    if "Ottoman" in monarchies:
       saveData('Ottoman', get_monarch_list("https://en.wikipedia.org/wiki/Category:Sultans_of_the_Ottoman_Empire",
                                           "Ottoman_sultans_/_caliphs675",
                                           ['navbox-list', 'hlist']))

    # --- Additional monarchies (robust title/Wikidata-based scraper) ---
    if "Thailand" in monarchies:
        saveData('Thailand', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_monarchs_of_Thailand", "navbox", "Monarchs_of_Thailand"))
    if "Greece" in monarchies:
        saveData('Greece', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_kings_of_Greece", "tables", None))
    if "Netherlands" in monarchies:
        saveData('Netherlands', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_monarchs_of_the_Netherlands", "navbox", "Monarchs_of_the_Netherlands"))
    if "Mughal" in monarchies:
        saveData('Mughal', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_emperors_of_the_Mughal_Empire", "tables", [0]))
    if "Byzantine" in monarchies:
        saveData('Byzantine', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_Byzantine_emperors", "tables", None))
    if "Egypt_Old_Kingdom" in monarchies:
        saveData('Egypt_Old_Kingdom', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_pharaohs", "egypt", "Old Kingdom", blocklist=EGYPT_BLOCKLIST))
    if "Egypt_Middle_Kingdom" in monarchies:
        saveData('Egypt_Middle_Kingdom', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_pharaohs", "egypt", "Middle Kingdom", blocklist=EGYPT_BLOCKLIST))
    if "Egypt_New_Kingdom" in monarchies:
        saveData('Egypt_New_Kingdom', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_pharaohs", "egypt", "New Kingdom", blocklist=EGYPT_BLOCKLIST))
    if "Mongol_Empire" in monarchies:
        saveData('Mongol_Empire', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_Mongol_rulers", "heading", "Great Khans", stop_after="Kublai_Khan"))
    if "Golden_Horde" in monarchies:
        saveData('Golden_Horde', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_khans_of_the_Golden_Horde", "tables", [0]))
    if "Ilkhanate" in monarchies:
        saveData('Ilkhanate', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_Mongol_rulers", "heading", "Ilkhanate"))
    if "Chagatai_Khanate" in monarchies:
        saveData('Chagatai_Khanate', scrape_monarchy(
            "https://en.wikipedia.org/wiki/List_of_Chagatai_khans", "tables", [0]))
    # Chinggisids is a union of the empires above, so it must run last.
    if "Chinggisids" in monarchies:
        build_chinggisids()

monarchies = [
    "England","France","Holy_Roman_Empire","Germany",
    "Spain","Russia","Sweden","Denmark","Scotland","Norway","Iceland","Bohemia","Austria","Hungary","Naples",
    "Portugal","Poland","Bavaria","Japan","Joseon","Shang", "Zhou", "Han", "Tang", "Yuan", "Ming", "Qing", "Ottoman",
    # Additional monarchies
    "Thailand", "Greece", "Netherlands", "Mughal", "Byzantine",
    "Egypt_Old_Kingdom", "Egypt_Middle_Kingdom", "Egypt_New_Kingdom",
    "Mongol_Empire", "Golden_Horde", "Ilkhanate", "Chagatai_Khanate", "Chinggisids",
]

if __name__ == '__main__':
    get_monarch_lists(["Spain"])