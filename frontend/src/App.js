import React from 'react';
import logo from './logo.svg';
import './App.css';
import TextField from '@material-ui/core/TextField';
import Autocomplete from '@material-ui/lab/Autocomplete';

const proxyurl = "https://cors-anywhere.herokuapp.com/";

const imageArray = ["https://www.nrlmry.navy.mil/tcdat/tc19/ATL/05L.DORIAN/ir/geo/1km/20190901.1300.goes16.x.ir1km.05LDORIAN.140kts-927mb-265N-765W.100pc.jpg",
  "https://www.nrlmry.navy.mil/tcdat/tc19/ATL/05L.DORIAN/ir/geo/1km/20190901.1700.goes16.x.ir1km.05LDORIAN.160kts-910mb-265N-771W.100pc.jpg"];


const imageDBKeys = ['season', 'basin', 'storm_number', 'storm_agency', 'storm_name', 'type', 'sensor', 'resolution',
  'image', 'image_url', 'year', 'month', 'day', 'hour', 'minute', 'second', 'satellite', 'extension'];

const seasonOptions = [{season: 2000}, {season: 2001}];

const imageOptions = {
  'season': seasonOptions
}

function arrayBufferToBase64(buffer) {
  var binary = '';
  var bytes = [].slice.call(new Uint8Array(buffer));

  bytes.forEach((b) => binary += String.fromCharCode(b));

  return window.btoa(binary);
};

function loadImage(imageUrl) {
  fetch(proxyurl + imageUrl).then((response) => {
    response.arrayBuffer().then((buffer) => {
      var base64Flag = 'data:image/jpeg;base64,';
      var imageStr = arrayBufferToBase64(buffer);
      const img = document.createElement("img");
      img.src = imageUrl;
      document.getElementById('myImg');
      // = base64Flag + imageStr
    });
  });
}

function App () {
  return (
      <div className="App">
        <header className="App-header">
          <container>
            <Autocomplete
                multiple
                id="season"
                options={seasonOptions}
                getOptionLabel={option => option.season}
                style={{width: 300}}
                renderInput={params => (
                    <TextField
                        {...params}
                        variant="standard"
                        label="Multiple values"
                        placeholder="Favorites"
                        fullWidth
                    />
                )}
            />
          </container>
        </header>
      </div>
  );
}

export default App