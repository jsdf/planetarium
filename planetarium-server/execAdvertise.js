const bleedAPI = require('../bleed/beat_advertise');

bleedAPI.setUUID(process.argv[2]);
bleedAPI.init();
