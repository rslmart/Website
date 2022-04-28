import pic from "./Pics/Me_Matterhorn.png";
import './App.css';

function App() {
  return (
    <div className="App">
      <div className={"center"}>
        <img src={pic} alt="logo" style={{ width: "auto", "max-height": "800px" }}/>
      </div>
    </div>
  );
}

export default App;
