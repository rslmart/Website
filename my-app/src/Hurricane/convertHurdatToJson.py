import json
from datetime import datetime
import operator

def decimal_coords(coords, ref):
    decimal_degrees = coords
    if ref == 'S' or ref == 'W':
        decimal_degrees = -decimal_degrees
    return decimal_degrees

if __name__ == '__main__':
    storms = {}
    track_points = []
    with open("./hurdat2-1851-2021-041922.txt") as file:
        storm_id = ""
        for line in file:
            line_arr = ''.join(line.split()).split(',')
            # Start of storm
            if len(line_arr) == 4:
                if len(storm_id) > 0:  # Means we are at the end of another storms list
                    if storms[storm_id]["min_pressure"] == 100000:
                        del storms[storm_id]["min_pressure"]
                    # sort track points by time
                    storms[storm_id]["track_points"].sort(key=operator.itemgetter('date_time'))
                storm_id = line_arr[0]+line_arr[1]
                print("Processing: " + storm_id)
                storms[storm_id] = {
                    "name": line_arr[1],
                    "basin": line_arr[0][0:2],
                    "number": int(line_arr[0][2:4]),
                    "season": int(line_arr[0][4:8]),
                    "id": storm_id,
                    "max_wind": 0,
                    "min_pressure": 100000,
                    "landfall": False,
                    "track_points": []
                }
            else:
                track_point = {
                    "id": storm_id,
                    "year": int(line_arr[0][0:4]),
                    "month": int(line_arr[0][4:6]),
                    "day": int(line_arr[0][6:8]),
                    "hours": int(line_arr[1][0:2]),
                    "minutes": int(line_arr[1][2:4]),
                    "date_time": datetime(
                        int(line_arr[0][0:4]),
                        int(line_arr[0][4:6]),
                        int(line_arr[0][6:8]),
                        int(line_arr[1][0:2]),
                        int(line_arr[1][2:4])
                    ),
                    "record_type": line_arr[2],
                    "status": line_arr[3],
                    "latitude": decimal_coords(float(line_arr[4][0:-1]), line_arr[4][-1]),
                    "longitude": decimal_coords(float(line_arr[5][0:-1]), line_arr[5][-1]),
                    "wind": int(line_arr[6]),
                    "pressure": int(line_arr[7]),
                    "34_ne": int(line_arr[8]),
                    "34_se": int(line_arr[9]),
                    "34_sw": int(line_arr[10]),
                    "34_nw": int(line_arr[11]),
                    "50_ne": int(line_arr[12]),
                    "50_se": int(line_arr[13]),
                    "50_sw": int(line_arr[14]),
                    "50_nw": int(line_arr[15]),
                    "64_ne": int(line_arr[16]),
                    "64_se": int(line_arr[17]),
                    "64_sw": int(line_arr[18]),
                    "64_nw": int(line_arr[19]),
                    "max_wind_radius": int(line_arr[20])
                }
                for key in list(track_point.keys()):
                    if track_point[key] == -999:
                        del track_point[key]
                if track_point["status"] == "L":
                    storms[storm_id]["landfall"] = True
                if track_point["wind"] > storms[storm_id]["max_wind"]:
                    storms[storm_id]["max_wind"] = track_point["wind"]
                if "pressure" in track_point and track_point["pressure"] < storms[storm_id]["min_pressure"]:
                    storms[storm_id]["min_pressure"] = track_point["pressure"]
                storms[storm_id]["track_points"].append(track_point)
                track_points.append(track_point)
    with open('storms.json', 'w') as fp:
        json.dump(storms, fp, default=str)
    with open('track_points.json', 'w') as fp:
        json.dump(track_points, fp, default=str)