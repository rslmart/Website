# first get all lines from file
with open('hurdat2-1851-2019-052520.csv', 'r') as f:
    lines = f.readlines()

# remove spaces
lines = [line.replace(' ', '') for line in lines]

# finally, write lines in the file
with open('hurdat2-1851-2019-052520.csv', 'w') as f:
    f.writelines(lines)