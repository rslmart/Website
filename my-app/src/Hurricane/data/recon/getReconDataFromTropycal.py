#Get data for Hurricane Michael (2018)
from tropycal import tracks
basin = tracks.TrackDataset()
storm = basin.get_storm(('michael',2018))

#Get all recon data for this storm
storm.recon.get_vdms()
#Save pickle file of VDM data (list of dictionaries)
storm.recon.vdms.to_pickle(f'{storm.name}{storm.year}_vdms.pickle')

storm.recon.get_dropsondes()
#Save pickle file of Dropsonde data (list of dictionaries)
storm.recon.dropsondes.to_pickle(f'{storm.name}{storm.year}_dropsondes.pickle')

storm.recon.get_hdobs()
#Save pickle file of HDOB data (Pandas dataframe)
storm.recon.hdobs.to_pickle(f'{storm.name}{storm.year}_hdobs.pickle')

storm.recon.get_vdms(f'{storm.name}{storm.year}_vdms.pickle')
storm.recon.get_dropsondes(f'{storm.name}{storm.year}_dropsondes.pickle')
storm.recon.get_hdobs(f'{storm.name}{storm.year}_hdobs.pickle')