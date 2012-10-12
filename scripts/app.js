define([
    "filepicker",
    "audio_lab",
    "stage_manager",
    "pubsub"
],

function(filepicker, audioLab, stageManager, Pubsub) {
    var stageSelector = '.stage',
        env,
        buffers = {}; // Cache audio buffers

    // Define all events in this app
    var EVENTS = {
        ENV_CHANGE: "env_change",
        FILE_UPLOAD: "file_upload",
        IR_UPLOAD: "ir_upload"
    };

    // Predefined IR files for the convolver node
    var defaultImpulseResponseFiles = [
        {
            name: "Narrow Bumpy Space",
            url: "/impulse_response//Narrow Bumpy Space.ir"
        },
        {
            name: "Parking Garage",
            url: "/impulse_response//Parking Garage.ir"
        }
    ];

    var initialize = function() {
        initializePubsubs();

        //Seting up Filepicker.io with api key
        filepicker.setKey('Au37jUzo0SOyKy5MgVvS8z');
        env = getEnv();
        env.defaultImpulseResponseFiles = defaultImpulseResponseFiles;

        audioLab.initialize(env);
        env.destinationMaxChannels = audioLab.getDestinationNumberOfChannels();
        stageManager.initialize(stageSelector, env);
    };
    
    function initializePubsubs() {
        Pubsub.subscribe(stageManager.EVENTS.CONNECTION, function(evt, info) {
            audioLab.connect({ source: info.sourceId, target: info.targetId });
        });
        Pubsub.subscribe(stageManager.EVENTS.DISCONNECTION, function(evt, info) {
            audioLab.disconnect({ source: info.sourceId, target: info.targetId });
        });
        Pubsub.subscribe(stageManager.EVENTS.NODE_REQUEST, function(evt, info) {
            audioLab.createNode(info);
        });
        Pubsub.subscribe(stageManager.EVENTS.SOURCE_PLAY, function(evt, info) {
            audioLab.playSource(info.id);
        });
        Pubsub.subscribe(stageManager.EVENTS.SOURCE_STOP, function(evt, info) {
            audioLab.stopSource(info.id);
        });
        Pubsub.subscribe(stageManager.EVENTS.SOURCE_PAUSE, function(evt, info) {
            audioLab.pauseSource(info.id);
        });
        Pubsub.subscribe(stageManager.EVENTS.SOURCE_SET, function(evt, info) {
            var id = info.id,
                url = info.url,
                mic = info.mic;
                
            if (mic) {
                audioLab.setSourceMic(id);
            } else if (url) {
                console.log("getting audio file data");
                getAudioData(url, function(data) {
                    console.log("setting source buffer");
                    audioLab.setSourceAudio(id, { id: url, buffer: data }, { url: url }, false);
                });
            } else {
                uploadSourceFile(function(url, data) {
                    console.log("getting audio file data");
                    getAudioData(url, function(data) {
                        console.log("setting source buffer");
                        audioLab.setSourceAudio(id, { id: url, buffer: data }, { url: url }, false);
                    });
                });
            }
        });
        Pubsub.subscribe(stageManager.EVENTS.DELAY_CHANGE, function(evt, info) {
            audioLab.setDelayValue(info.id, info.value);
        });
        Pubsub.subscribe(stageManager.EVENTS.GAIN_CHANGE, function(evt, info) {
            audioLab.setGainValue(info.id, info.value);
        });
        Pubsub.subscribe(stageManager.EVENTS.PANNER_POSITION_CHANGE, function(evt, info) {
            audioLab.setPannerPosition(info.id, info.position);
        });
        Pubsub.subscribe(stageManager.EVENTS.CONVOLVER_SET, function(evt, info) {
            var id = info.id,
                url = info.url;
            if (url) {
                console.log("getting audio file data");
                getAudioData(url, function(data) {
                    console.log("setting convolver buffer");
                    audioLab.setConvolverIR(id, { id: url, buffer: data }, { url: url });
                });
            } else {
                uploadIRFile(function(url, data) {
                    console.log("getting audio file data");
                    getAudioData(url, function(data) {
                        console.log("setting convolver buffer");
                        audioLab.setConvolverIR(id, { id: url, buffer: data }, { url: url });
                    });
                });
            }
        });
        Pubsub.subscribe(stageManager.EVENTS.COMPRESSOR_THRESHOLD_CHANGE, function(evt, info) {
            audioLab.setCompressorThreshold(info.id, info.value);
        });
        Pubsub.subscribe(stageManager.EVENTS.COMPRESSOR_RATIO_CHANGE, function(evt, info) {
            audioLab.setCompressorRatio(info.id, info.value);
        });
        Pubsub.subscribe(stageManager.EVENTS.BIQUAD_FILTER_TYPE_CHANGE, function(evt, info) {
            audioLab.setBiquadFilterType(info.id, info.value);
        });
        Pubsub.subscribe(stageManager.EVENTS.BIQUAD_FILTER_FREQUENCY_CHANGE, function(evt, info) {
            audioLab.setBiquadFilterFrequency(info.id, info.value);
        });
        Pubsub.subscribe(stageManager.EVENTS.BIQUAD_FILTER_QUALITY_CHANGE, function(evt, info) {
            audioLab.setBiquadFilterQuality(info.id, info.value);
        });
        Pubsub.subscribe(audioLab.EVENTS.NODE_CREATE, function(evt, data) {
            stageManager.createNode(data);
        });
        Pubsub.subscribe(audioLab.EVENTS.SOURCE_PLAY, function(evt, info) {
            info.type = 'stop';
            stageManager.enableSourcePauseButton(info);
            stageManager.startSourceProgressBar(info);
            stageManager.setSourceControlType(info);
        });
        Pubsub.subscribe(audioLab.EVENTS.SOURCE_STOP, function(evt, info) {
            info.type = 'play';
            stageManager.disableSourcePauseButton(info);
            stageManager.stopSourceProgressBar(info);
            stageManager.setSourceControlType(info);
        });
        Pubsub.subscribe(audioLab.EVENTS.SOURCE_PAUSE, function(evt, info) {
            info.type = 'play';
            stageManager.disableSourcePauseButton(info);
            stageManager.stopSourceProgressBar(info);
            stageManager.setSourceControlType(info);
        });
        Pubsub.subscribe(audioLab.EVENTS.SOURCE_BUFFER_SET, function(evt, info) {
            info.url = info.data.url;
            stageManager.enableSourcePlayButton(info);
            stageManager.setSourceInput(info);
        });
        Pubsub.subscribe(audioLab.EVENTS.CONVOLVER_BUFFER_SET, function(evt, info) {
            info.url = info.data.url;
            stageManager.setConvolverIR(info);
        });
        Pubsub.subscribe(EVENTS.ENV_CHANGE, function(evt, info) {
            stageManager.setEnv(info.env);
        });
        Pubsub.subscribe(EVENTS.FILE_UPLOAD, function(evt, info) {
            stageManager.addSourceFile(info);
        });
        Pubsub.subscribe(EVENTS.IR_UPLOAD, function(evt, info) {
            stageManager.addIRFile(info);
        });
    }

    function getEnv() {
        var env = {
            audioFiles: [],
            impulseResponseFiles: []
        };
        if (typeof(localStorage) == 'undefined' ) {
            console.log("No support for localstorage. Lab data will not be saved.");
        } else {
            var envData = localStorage.getItem("webAudioApiLab");
            if (envData) {
                env = JSON.parse(envData);
            } else {
                console.log("Env data was corrupt.");
            }
        }
        
        return env;
    }

    function saveEnv(env) {
        Pubsub.publish(EVENTS.ENV_CHANGE, { env: env });
        if (typeof(localStorage) == 'undefined' ) {
            console.log("No support for localstorage. Lab data will not be saved.");
        } else {
            var envData = JSON.stringify(env);
            if (envData) {
                try {
                    localStorage.setItem("webAudioApiLab", envData);
                } catch (e) {
                    if (e == QUOTA_EXCEEDED_ERR) {
                        console.log('Localstorage quota exceeded.'); //data wasn't successfully saved due to quota exceed
                    } else {
                        console.log('Error occured while saving to Localstorage.');
                    }
                }
            } else {
                console.log("Env data was corrupt.");
            }
        }
    }

    function uploadSourceFile(callback) {
        filepicker.getFile(filepicker.MIMETYPES.AUDIO, {
            'multiple': false,
            'services': [
                filepicker.SERVICES.BOX,
                filepicker.SERVICES.COMPUTER,
                filepicker.SERVICES.DROPBOX,
                filepicker.SERVICES.GITHUB,
                filepicker.SERVICES.GOOGLE_DRIVE,
                filepicker.SERVICES.EVERNOTE,
                filepicker.SERVICES.GMAIL,
                filepicker.SERVICES.URL
            ]},
            function(url, data) {
                Pubsub.publish(EVENTS.FILE_UPLOAD, {
                    filename: data.filename,
                    url: url
                });
                // Update env
                if (!env.audioFiles) {
                    env.audioFiles = [];
                }
                env.audioFiles.push({
                    name: data.filename,
                    url: url
                });
                saveEnv(env);
                callback(url, data);
            }
        );
    }

    function uploadIRFile(callback) {
        filepicker.getFile(filepicker.MIMETYPES.AUDIO, {
            'multiple': false,
            'services': [
                filepicker.SERVICES.BOX,
                filepicker.SERVICES.COMPUTER,
                filepicker.SERVICES.DROPBOX,
                filepicker.SERVICES.GITHUB,
                filepicker.SERVICES.GOOGLE_DRIVE,
                filepicker.SERVICES.EVERNOTE,
                filepicker.SERVICES.GMAIL,
                filepicker.SERVICES.URL
            ]},
            function(url, data) {
                Pubsub.publish(EVENTS.IR_UPLOAD, {
                    filename: data.filename,
                    url: url
                });
                // Update env
                if (!env.impulseResponseFiles) {
                    env.impulseResponseFiles = [];
                }
                env.impulseResponseFiles.push({
                    name: data.filename,
                    url: url
                });
                saveEnv(env);
                callback(url, data);
            }
        );
    }

    function getAudioData(url, callback) {
        if (url in buffers) {
            callback(buffers[url]);
        } else {
            // Must use manual ajax request to receive data as ArrayBuffer
            var request = new XMLHttpRequest();
            request.open('GET', url, true);
            request.responseType = 'arraybuffer';

            // Decode asynchronously
            request.onload = function() {
                buffers[url] = request.response;
                callback(request.response);
            };
            request.send();
        }
    }
    
    return {
        initialize: initialize
    };
});