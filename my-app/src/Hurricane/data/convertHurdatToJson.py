import json
from datetime import datetime
import math
import geopy.distance

'''
Fixes
CHLOE 1967 - last coordinate
DEBBIE 1969 - last coordinate
AL211969 - last 4 coordinates
FAITH 1966 - last 29 coordinates
'''


def decimal_coords(coords, ref):
    decimal_degrees = coords
    if ref == 'S' or ref == 'W':
        decimal_degrees = -decimal_degrees
    return decimal_degrees


def getNewCoordinates(lon, lat, bearing, distance):
    point = geopy.distance.distance(nautical=distance).destination((lat, lon), bearing)
    return [round(point.longitude, 3), round(point.latitude, 3)]

def getBearing(key):
    two_letters = key[-2:]
    if two_letters == 'ne':
        return 45
    if two_letters == 'se':
        return 135
    if two_letters == 'sw':
        return 225
    if two_letters == 'nw':
        return 315

def addWindPolygons(track_point):
    key_list = ["34_ne", "34_se", "34_sw", "34_nw", "50_ne", "50_se", "50_sw", "50_nw", "64_ne", "64_se", "64_sw", "64_nw"]
    for key in key_list:
        if track_point[key] > 0:
            coords = [track_point["longitude"], track_point["latitude"]]
            new_coords = getNewCoordinates(coords[0], coords[1], getBearing(key), track_point[key])

            bot_top_bearing = 0
            if key[3] == 's':
                bot_top_bearing = 180
            bot_top_coords = getNewCoordinates(coords[0], coords[1], bot_top_bearing, track_point[key])

            left_right_bearing = 90
            if key[4] == 'w':
                left_right_bearing = 270
            left_right_coords = getNewCoordinates(coords[0], coords[1], left_right_bearing,track_point[key])
            track_point[key + "_poly"] = [coords, bot_top_coords, new_coords, left_right_coords, coords]

def addMaxWindPolygon(track_point):
    if track_point["max_wind_radius"] > 0:
        coords = [track_point["longitude"], track_point["latitude"]]
        north_coords = getNewCoordinates(coords[0], coords[1], 0, track_point["max_wind_radius"])
        east_coords = getNewCoordinates(coords[0], coords[1], 90, track_point["max_wind_radius"])
        south_coords = getNewCoordinates(coords[0], coords[1], 180, track_point["max_wind_radius"])
        west_coords = getNewCoordinates(coords[0], coords[1], 270, track_point["max_wind_radius"])
        track_point["max_wind_poly"] = [north_coords, east_coords, south_coords, west_coords, north_coords]



if __name__ == '__main__':
    storms = {}
    track_points = []
    with open("hurdat2.txt") as file:
        storm_id = ""
        for line in file:
            line_arr = ''.join(line.split()).split(',')
            # Start of storm
            if len(line_arr) == 4:
                if len(storm_id) > 0:  # Means we are at the end of another storms list
                    storms[storm_id]["ACE"] = storms[storm_id]["ACE"] / 10000
                    storms[storm_id]["status_list"] = list(storms[storm_id]["status_list"])
                    storms[storm_id]["record_type_list"] = list(storms[storm_id]["record_type_list"])
                    if storms[storm_id]["min_pressure"] == 100000:
                        del storms[storm_id]["min_pressure"]
                storm_id = line_arr[0] + line_arr[1]
                print("Processing: " + storm_id)
                storms[storm_id] = {
                    "name": line_arr[1],
                    "basin": line_arr[0][0:2],
                    "number": int(line_arr[0][2:4]),
                    "season": int(line_arr[0][4:8]),
                    "id": storm_id,
                    "max_wind": 0,
                    "min_pressure": 100000,
                    "status_list": set(),
                    "record_type_list": set(),
                    "ACE": 0,
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
                addWindPolygons(track_point)
                addMaxWindPolygon(track_point)
                if track_point["wind"] < 0:
                    track_point["wind"] = 0
                if track_point["longitude"] < -250:
                    track_point["longitude"] = 360 + track_point["longitude"]
                # ACE
                storms[storm_id]["ACE"] += (track_point["wind"] * track_point["wind"])
                track_point["ACE"] = storms[storm_id]["ACE"] / 10000
                for key in list(track_point.keys()):
                    if track_point[key] == -999:
                        del track_point[key]
                if len(track_point["record_type"]) > 0:
                    storms[storm_id]["record_type_list"].add(track_point["record_type"])
                if len(track_point["status"]) > 0:
                    storms[storm_id]["status_list"].add(track_point["status"])
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
