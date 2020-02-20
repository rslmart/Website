from Backend.utils import downloadCSV
import os

if __name__ == '__main__':
    downloadCSV('https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r00/access/csv/ibtracs.ALL.list.v04r00.csv',
                os.path.join('./','Data','ibtracs'), 'ibtracs.ALL.csv')
