import requests
from bs4 import BeautifulSoup
import json
import os

def flatten(l):
    return [item for sublist in l for item in sublist]

def get_monarch_list(url, div_name, td_classes):
    response = requests.get(
        url=url
    )
    soup = BeautifulSoup(response.content, 'html.parser')
    div_element = soup.find('div', attrs={'aria-labelledby': div_name})
    td_elements = div_element.find_all('td', attrs={'class': td_classes})
    li_tags = flatten([td_element.find_all('li') for td_element in td_elements])
    monarchs = [li_tag.find('a').get('href') for li_tag in li_tags if li_tag.find('a')]
    return [x for i, x in enumerate(monarchs) if x not in monarchs[:i]]

def saveData(list_name, monarch_list):
    print("Saving Data: {}".format(len(monarch_list)))
    file_path = 'monarch_list.json'
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
if __name__ == '__main__':
    # Kings of England
    response = requests.get(
        url="https://en.wikipedia.org/wiki/List_of_English_monarchs",
    )
    soup = BeautifulSoup(response.content, 'html.parser')
    div_element = soup.find('div', attrs={'aria-labelledby': 'English,_Scottish_and_British_monarchs'})
    td_element = div_element.find(lambda tag: tag.name == 'td' and tag['class'] == ['navbox-list'])
    li_tags = td_element.find_all('li')
    kings_of_england = [li_tag.find('a').get('href') for li_tag in li_tags if li_tag.find('a')]
    td_elements = div_element.find('td', attrs={'class': "navbox-list navbox-even hlist"})
    li_tags = td_elements.find_all('li')
    td_elements = div_element.find('td', attrs={'class': "navbox-list navbox-odd hlist"})
    li_tags = li_tags + td_elements.find_all('li')
    kings_of_england = kings_of_england + [li_tag.find('a').get('href') for li_tag in li_tags if li_tag.find('a')]
    kings_of_england = [x for i, x in enumerate(kings_of_england) if x not in kings_of_england[:i]]
    saveData('England', kings_of_england)

    # Kings of France
    saveData('France', get_monarch_list("https://en.wikipedia.org/wiki/List_of_French_monarchs", 'Monarchs_of_France', ['navbox-list-with-group', 'navbox-list', 'hlist']))

    # Holy Roman Emperors
    saveData('Holy_Roman_Empire', get_monarch_list("https://en.wikipedia.org/wiki/Holy_Roman_Emperor", 'Holy_Roman_Emperors', ['navbox-list', 'hlist']))

    # German Kings
    saveData('Germany', get_monarch_list("https://en.wikipedia.org/wiki/List_of_German_monarchs", 'Monarchs_of_Germany', ['navbox-list-with-group', 'navbox-list', 'hlist']))

    # Spanish Monarchs
    # print(get_monarch_list("https://en.wikipedia.org/wiki/List_of_Spanish_monarchs", 'Monarchs_of_Spain', 'navbox-list navbox-odd hlist'))
    response = requests.get(
        url="https://en.wikipedia.org/wiki/List_of_Spanish_monarchs",
    )
    soup = BeautifulSoup(response.content, 'html.parser')
    tr_tags = soup.find_all('tr')
    td_tags = []
    for tr_tag in tr_tags:
        temp = tr_tag.find_all('td')
        if len(temp) >= 3:
            td_tags.append(temp[0])
            td_tags.append(temp[1])
            td_tags.append(temp[2])
    spanish_monarchs = []
    for td_tag in td_tags:
        a_tag = td_tag.find('a')
        if a_tag:
            href = a_tag.get('href')
            spanish_monarchs.append(href)
        else:
            b_tags = td_tag.find_all('b')
            for b_tag in b_tags:
                a_tag = b_tag.find('a')
                if a_tag:
                    href = a_tag.get('href')
                    spanish_monarchs.append(href)
    spanish_monarchs = [h for h in spanish_monarchs if h.startswith('/wiki/') and not h.startswith('/wiki/File:') and not h.startswith('/wiki/Pope')][:-3]
    spanish_monarchs = [x for i, x in enumerate(spanish_monarchs) if x not in spanish_monarchs[:i]]
    saveData('Spain', spanish_monarchs)

    # Russian Monarchs
    saveData('Russia', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Russian_monarchs", 'List_of_Russian_monarchs', ['navbox-list-with-group', 'navbox-list', 'hlist']))

    # Swedish Monarchs
    saveData('Sweden', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Swedish_monarchs", 'Monarchs_of_Sweden', ['navbox-list-with-group', 'navbox-list']))

    # Danish Monarchs
    saveData('Denmark', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Danish_monarchs", 'Monarchs_of_Denmark', ['navbox-list-with-group', 'navbox-list']))

    # Scottish Monarchs
    saveData('Scotland', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Scottish_monarchs", 'Pictish_and_Scottish_monarchs', ['navbox-list-with-group', 'navbox-list']))

    # Norwegian Monarchs
    saveData('Norway', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Norwegian_monarchs", 'Monarchs_of_Norway', ['navbox-list-with-group', 'navbox-list']))

    # Icelanic Monarchs
    saveData('Iceland', get_monarch_list("https://en.wikipedia.org/wiki/Lists_of_heads_of_state_of_Iceland", 'Monarchs_of_Iceland', ['navbox-list-with-group', 'navbox-list']))

    # List_of_Bohemian_monarchs
    saveData('Bohemia', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Bohemian_monarchs", 'Monarchs_of_Bohemia', ['navbox-list-with-group', 'navbox-list']))

    # List_of_rulers_of_Austria
    saveData('Austria', get_monarch_list("https://en.wikipedia.org/wiki/List_of_rulers_of_Austria", 'Monarchs_of_Austria', ['navbox-list-with-group', 'navbox-list']))

    # List_of_Hungarian_monarchs
    saveData('Hungary', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Hungarian_monarchs", 'Monarchs_of_Hungary', ['navbox-list-with-group', 'navbox-list']))

    # List_of_monarchs_of_Naples
    saveData('Naples', get_monarch_list("https://en.wikipedia.org/wiki/List_of_monarchs_of_Naples", 'Monarchs_of_Naples', ['navbox-list-with-group', 'navbox-list']))

    # List_of_Portuguese_monarchs
    saveData('Portugal', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Portuguese_monarchs", 'Monarchs_of_Portugal', ['navbox-list-with-group', 'navbox-list']))

    # List_of_Polish_monarchs
    saveData('Poland', get_monarch_list("https://en.wikipedia.org/wiki/List_of_Polish_monarchs", 'Monarchs_of_Poland', ['navbox-list-with-group', 'navbox-list']))

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
    bavarian_monarchs = [h for h in bavarian_monarchs if h.startswith('/wiki/') and not h.startswith('/wiki/File:') and not h.startswith('/wiki/Pope')][:-18]
    bavarian_monarchs = [x for i, x in enumerate(bavarian_monarchs) if x not in bavarian_monarchs[:i]]
    saveData('Bavaria', bavarian_monarchs)

    # List_of_emperors_of_Japan
    saveData('Japan', get_monarch_list("https://en.wikipedia.org/wiki/List_of_emperors_of_Japan", '23x15px&#124;border&#124;link=Japan&#124;alt=Japan_Emperors_of_Japan_(list)', ['navbox-list-with-group', 'navbox-list']))