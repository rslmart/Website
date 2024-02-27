from csv import reader
from datetime import datetime, timedelta
import json
import os

strm_to_tcdat_basin = {
    "AL": "ATL",
    "CP": "CPAC",
    "EP": "EPAC"
}

def convertDTStr(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")

if __name__ == '__main__':
    pic_dict = {}
    if not os.path.exists('./pics.json'):
        with open('ir_tcdat.csv', 'r') as read_obj:
            csv_reader = reader(read_obj)
            header = next(csv_reader)
            # Check file as empty
            if header != None:
                # Iterate over each row after the header in the csv
                for row in csv_reader:
                    # row variable is a list that represents a row in csv
                    try:
                        arr = row[0].split('/')[-1].split('.')
                        if len(arr[1]) == 6:
                            date = datetime(int(arr[0][:4]), int(arr[0][4:6]), int(arr[0][6:]), int(arr[1][:2]), int(arr[1][2:4]), int(arr[1][5:]))
                        else:
                            date = datetime(int(arr[0][:4]), int(arr[0][4:6]), int(arr[0][6:]), int(arr[1][:2]), int(arr[1][2:]))
                        season = pic_dict.setdefault(row[1], {})
                        basin = season.setdefault(row[2], {})
                        storm_name = basin.setdefault(row[3].split('.')[-1], [])
                        storm_name.append((date, row[0]))
                    except Exception as e:
                        print("error: ", e, "\nrow: ", row)
                with open('pics.json', 'w') as fp:
                    json.dump(pic_dict, fp, default=str)
    else:
        with open('pics.json', 'r') as read_obj:
            pic_dict = json.load(read_obj)

    with open('storms.json', 'r') as read_obj:
        storm_dict = json.load(read_obj)
        for storm_id in storm_dict:
            season = storm_id[4:8]
            basin = strm_to_tcdat_basin[storm_id[0:2]]
            name = storm_id[8:]
            if season in pic_dict and basin in pic_dict[season] and name in pic_dict[season][basin]:
                for point in storm_dict[storm_id]["track_points"]:
                    found = False
                    point_date = convertDTStr(point["date_time"])
                    for delta in range(15, 3*4*15, 15):
                        matching = [p for p in pic_dict[season][basin][name] if point_date - timedelta(minutes=delta) <= convertDTStr(p[0]) <= point_date + timedelta(minutes=delta)]
                        if len(matching) > 0:
                            point["ir_image_url"] = matching[0][1]
                            print(point)
                            found = True
                            break
                        if found:
                            break
            else:
                print(season, basin, name)
        with open('storms_with_ir.json', 'w') as fp:
            json.dump(storm_dict, fp, default=str)
