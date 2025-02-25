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
        saveData('Spain', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Spanish_monarchs", 'Monarchs_of_Spain174', 'navbox-list-with-group navbox-list navbox-odd hlist'))

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
        saveData('Denmark', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Danish_monarchs", 'Monarchs_of_Denmark885',
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

monarchies = [
    "England","France","Holy_Roman_Empire","Germany",
    "Spain","Russia","Sweden","Denmark","Scotland","Norway","Iceland","Bohemia","Austria","Hungary","Naples",
    "Portugal","Poland","Bavaria","Japan","Joseon","Shang", "Zhou", "Han", "Tang", "Yuan", "Ming", "Qing", "Ottoman",
]

if __name__ == '__main__':
    get_monarch_lists(monarchies)