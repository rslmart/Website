import os
import re
rootdir = './'

file_dict = {
    'A': [],
    'D': [],
    'dob': [],
    'H': [],
    'M': [],
    'Q': [],
    'J': [],
    'ops': [],
    'R': [],
    'S': [],
    'V': [],
    'dat': [],
    'HDOBS_dat': [],
    'DROPS': [],

    'HDOB': [],
    'REPRPD': [],

    'AHONT1': [],
    'REPNT0': [],
    'REPNT1': [],
    'REPNT2': [],
    'REPNTSUP': [],
    'REPNT3': [],
    'URNT40': [],

    'AHOPN1': [],
    'REPPN0': [],
    'REPPN1': [],
    'REPPN2': [],
    'REPPNSUP': [],
    'REPPN3': [],

    'AHOPA1': [],
    'REPPA0': [],
    'REPPPA1': [],
    'REPPA2': [],
    'REPPA3': [],

    'misc': []
}
for subdir, dirs, files in os.walk(rootdir):
    for file in files:
        if re.fullmatch('a\d+.\w\d+\.txt', file) or re.fullmatch('A[\w\d]+.[\w\d]+.txt', file):
            file_dict['A'].append(os.path.join(subdir, file))
        elif re.fullmatch('D\d+.[\d\w]+\.txt', file) or re.fullmatch('D\d+C\d+.[\d\w]+\.txt', file) or re.fullmatch('d\d+.[\d\w]+\.txt', file) or re.fullmatch('d\d+c\d+.\w\d+\.txt', file) or re.fullmatch('D\d+~+[\w\d]+.[\w\d]+.txt', file):
            file_dict['D'].append(os.path.join(subdir, file))
        elif re.fullmatch('dob.\d+\.txt', file):
            file_dict['dob'].append(os.path.join(subdir, file))
        elif re.fullmatch('H\d+.[\d\w]+\.txt', file) or re.fullmatch('H\d+A.[\d\w]+\.txt', file) or re.fullmatch('h\d+.[\d\w]+\.txt', file):
            file_dict['H'].append(os.path.join(subdir, file))
        elif re.fullmatch('M\d+.[\d\w]+\.txt', file) or re.fullmatch('m\d+.\d+\.txt', file) or re.fullmatch('M\d+~+[\w\d]+.[\w\d]+.txt', file):
            file_dict['M'].append(os.path.join(subdir, file))
        elif re.fullmatch('Q\d+.[\d\w]+.txt', file) or re.fullmatch('q\d+.[\d\w]+\.txt', file):
            file_dict['Q'].append(os.path.join(subdir, file))
        elif re.fullmatch('J\d+.\d+\.txt', file) or re.fullmatch('J\d+~~~\d+.[\w\d]+.txt', file):
            file_dict['J'].append(os.path.join(subdir, file))
        elif re.fullmatch('ops\d*.\w\d+\.txt', file) or re.fullmatch('OPS\d+.[\w\d]+.txt', file):
            file_dict['ops'].append(os.path.join(subdir, file))
        elif re.fullmatch('R\d+.[\d\w]+\.txt', file) or re.fullmatch('R\d+C\d+.[\d\w]+\.txt', file) or re.fullmatch('r\d+.[\d\w]+\.txt', file) or re.fullmatch('r\d+c\d+.\w\d+\.txt', file) or re.fullmatch('R\d+~+[\w\d]+.[\w\d]+.txt', file):
            file_dict['R'].append(os.path.join(subdir, file))
        elif re.fullmatch('S\d+.[\d\w]+\.txt', file) or re.fullmatch('S\d+C\d+.[\d\w]+\.txt', file) or  re.fullmatch('s\d+.[\d\w]+\.txt', file) or re.fullmatch('s\d+c\d+.\w\d+\.txt', file):
            file_dict['S'].append(os.path.join(subdir, file))
        elif re.fullmatch('V[\d\w]+.[\d\w]+\.txt', file) or re.fullmatch('V\d+C\d+.[\d\w]+\.txt', file) or re.fullmatch('v\d+.[\d\w]+\.txt', file) or re.fullmatch('v\d+c\d+.\w\d+\.txt', file) or re.fullmatch('V\d+~+[\w\d]+.[\w\d]+.txt', file):
            file_dict['V'].append(os.path.join(subdir, file))
        elif re.fullmatch('[\d\w]+_[\d\w]+_\d+.dat.txt', file):
            file_dict['dat'].append(os.path.join(subdir, file))
        elif re.fullmatch('[\d\w]+_HDOBS_[\d\w]+_\d+.dat.txt', file):
            file_dict['HDOBS_dat'].append(os.path.join(subdir, file))
        elif re.fullmatch('[\d\w]+_DROPS_[\d\w]+_\d+.dat.txt', file) or re.fullmatch('[\d\w]+_[\d\w]+_DROPS_\d+.dat.txt', file):
            file_dict['DROPS'].append(os.path.join(subdir, file))

        elif re.fullmatch('HDOB.\d+.txt', file):
            file_dict['HDOB'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPRPD.\d+.txt', file):
            file_dict['REPRPD'].append(os.path.join(subdir, file))

        elif re.fullmatch('AHONT1-\w+.\d+.txt', file):
            file_dict['AHONT1'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPNT0-\w+.\d+.txt', file) or re.fullmatch('REPNT0.\d+.txt', file):
            file_dict['REPNT0'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPNT1-\w+.\d+.txt', file) or re.fullmatch('REPNT1.\d+.txt', file):
            file_dict['REPNT1'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPNT2-\w+.\d+.txt', file) or re.fullmatch('REPNT2.\d+.txt', file):
            file_dict['REPNT2'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPNTSUP-\w+.\d+.txt', file) or re.fullmatch('REPNTSUP.\d+.txt', file):
            file_dict['REPNTSUP'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPNT3-\w+.\d+.txt', file) or re.fullmatch('REPNT3.\d+.txt', file):
            file_dict['REPNT3'].append(os.path.join(subdir, file))
        elif re.fullmatch('URNT40.\d+.txt', file):
            file_dict['URNT40'].append(os.path.join(subdir, file))

        elif re.fullmatch('AHOPN1-\w+.\d+.txt', file):
            file_dict['AHOPN1'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPN0-\w+.\d+.txt', file) or re.fullmatch('REPPN0.\d+.txt', file):
            file_dict['REPPN0'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPN1-\w+.\d+.txt', file) or re.fullmatch('REPPN1.\d+.txt', file):
            file_dict['REPPN1'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPN2-\w+.\d+.txt', file) or re.fullmatch('REPPN2.\d+.txt', file):
            file_dict['REPPN2'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPNSUP-\w+.\d+.txt', file) or re.fullmatch('REPPNSUP.\d+.txt', file):
            file_dict['REPPNSUP'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPN3-\w+.\d+.txt', file) or re.fullmatch('REPPN3.\d+.txt', file):
            file_dict['REPPN3'].append(os.path.join(subdir, file))

        elif re.fullmatch('AHOPA1-\w+.\d+.txt', file):
            file_dict['AHOPA1'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPA0-\w+.\d+.txt', file):
            file_dict['REPPA0'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPPA1-\w+.\d+.txt', file):
            file_dict['REPPPA1'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPA2-\w+.\d+.txt', file):
            file_dict['REPPA2'].append(os.path.join(subdir, file))
        elif re.fullmatch('REPPA3-\w+.\d+.txt', file):
            file_dict['REPPA3'].append(os.path.join(subdir, file))

        else:
            file_dict['misc'].append(os.path.join(subdir, file))

for key in file_dict:
    print(key, len(file_dict[key]))