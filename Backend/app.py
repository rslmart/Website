from flask import Flask, jsonify
import pymongo
import json

app = Flask(__name__)

myclient = pymongo.MongoClient("mongodb://localhost:27017/")
mydb = myclient["mydatabase"]
imagesCol = mydb["images"]
ibtracsCol = mydb["ibtracs"]

@app.route('/')
def hello_world():
    return 'Hello World!'

@app.route('/images', methods=['GET'])
def imageQuery():
    print(request.get_json())
    print(json.laods(request.get_json()))
    output = []
    for s in imagesCol.find(json.laods(request.get_json())):
        output.append(s)
    return jsonify({'result': output})


if __name__ == '__main__':
    app.run()
