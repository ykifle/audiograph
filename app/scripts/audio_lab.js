define([
    "pubsub"
],

function(Pubsub) {
    var nodes = { count: 0 },
        destinations = { count: 0 },
        sources = { count: 0 },
        delayNodes = { count: 0 },
        gainNodes = { count: 0 },
        pannerNodes = { count: 0 },
        convolverNodes = { count: 0 },
        compressorNodes = { count: 0 },
        biquadFilterNodes = { count: 0 },
        connections = [],
        audioBuffers = {},
        context;

    // Define audio events
    var EVENTS = {
        NODE_CREATE: "audio.node.create",
        SOURCE_PLAY: "audio.source.play",
        SOURCE_STOP: "audio.source.stop",
        SOURCE_BUFFER_SET: "audio.source.buffer_set",
        CONVOLVER_BUFFER_SET: "audio.convolver.buffer_set"
    };
    // Define node types
    var NODES = {
        DESTINATION: "destination",
        SOURCE: "source",
        DELAY: "delay",
        GAIN: "gain",
        PANNER: "panner",
        CONVOLVER: "convolver",
        COMPRESSOR: "compressor",
        BIQUAD_FILTER: "biquad_filter"
    };
    
    var initialize = function() {
        context = getContext();
        if (!context) {
            return false;
        }
        return true;
    };

    var createNode = function(info) {
        var id = info.id,
            type = info.type,
            opts = info.opts,
            node;

        switch (type) {
            case NODES.DESTINATION:
                node = createDestination(id);
                break;
            case NODES.SOURCE:
                node = createSource(id);
                break;
            case NODES.DELAY:
                node = createDelayNode(id);
                break;
            case NODES.GAIN:
                node = createGainNode(id);
                break;
            case NODES.PANNER:
                node = createPannerNode(id);
                break;
            case NODES.CONVOLVER:
                node = createConvolverNode(id);
                break;
            case NODES.COMPRESSOR:
                node = createCompressorNode(id);
                break;
            case NODES.BIQUAD_FILTER:
                node = createBiquadFilterNode(id);
                break;
            default:
                break;
        }
        if (node) {
            Pubsub.publish(EVENTS.NODE_CREATE, info);
        }
    };

    var setSourceAudio = function(id, bufferData, passData, autoPlay) {
        var source = nodes[id];
        if (source) {
            if (bufferData.id && bufferData.id in audioBuffers) {
                setSourceBuffer(id, audioBuffers[bufferData.id], passData);
                if (autoPlay) {
                    playSource(id);
                }
            } else {
                context.decodeAudioData(bufferData.buffer, function(buffer) {
                    if (bufferData.id) {
                        // Catch AudioBuffer
                        audioBuffers[bufferData.id] = buffer;
                    }
                    setSourceBuffer(id, buffer, passData);
                    if (autoPlay) {
                        playSource(id);
                    }
                }, function() {
                    // Error while decoding
                });
            }
        }
    };

    var playSource = function(id) {
        var source = nodes[id];
        if (source) {
            // FINISHED_STATE is the final state of source so check if we need a new source node
            if (source.playbackState === source.FINISHED_STATE) {
                var connections = disconnect({ source: id });
                source = createSource(id, source.buffer);
                connect(connections);
            }
            if (source.noteOn) {
                source.noteOn(0);
            } else {
                source.start(0);
            }
            Pubsub.publish(EVENTS.SOURCE_PLAY, { id: id, state: source.playbackState });
        }
    };

    var stopSource = function(id) {
        var source = nodes[id];
        if (source) {
            if (source.noteOff) {
                source.noteOff(0);
            } else {
                source.stop(0);
            }
            Pubsub.publish(EVENTS.SOURCE_STOP, { id: id, state: source.playbackState });
        }
    };

    var connect = function(config) {
        if (config instanceof Array) {
            for (var i = 0; i < config.length; i++) {
                makeConnection(config[i]);
            }
        } else {
            makeConnection(config);
        }
    };

    var disconnect = function(config) {
        var removedConnections = [];
        if (!config.source && !config.target) {
            return removedConnections;
        }
        var resConnections = [];
        for (var i = 0; i < connections.length; i++) {
            var con = connections[i];
            if ((config.source && con.source != config.source) 
                || (config.target && con.target != config.target)) {
                resConnections.push(con);
            } else {
                var sourceNode = nodes[con.source],
                    targetNode = nodes[con.target];
                sourceNode.disconnect(targetNode);
                removedConnections.push(con);
            }
        }
        connections = resConnections;
        return removedConnections;
    };

    var setDelayValue = function(id, delay) {
        var delayNode = nodes[id];
        if (delayNode) {
            delayNode.delayTime.value = delay;
        }
    };

    var setGainValue = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.gain.value = value;
        }
    };

    var setPannerPosition = function(id, pos) {
        var node = nodes[id];
        if (node) {
            node.setPosition(pos.x, pos.y, pos.z);
        }
    };

    var setConvolverIR = function(id, bufferData, passData) {
        var node = nodes[id];
        if (node) {
            if (bufferData.id && bufferData.id in audioBuffers) {
                setConvolverBuffer(id, audioBuffers[bufferData.id], passData);
            } else {
                context.decodeAudioData(bufferData.buffer, function(buffer) {
                    if (bufferData.id) {
                        // Catch AudioBuffer
                        audioBuffers[bufferData.id] = buffer;
                    }
                    setConvolverBuffer(id, buffer, passData);
                }, function() {
                    // Error while decoding
                });
            }
        }
    };

    var setCompressorThreshold = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.threshold.value = value;
        }
    };

    var setCompressorRatio = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.ratio.value = value;
        }
    };
    
    var setBiquadFilterType = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.type = value;
        }
    };
    
    var setBiquadFilterFrequency = function(id, value) {
        var node = nodes[id];
        if (node) {
            // Clamp the frequency between the minimum value (40 Hz) and half of the
            // sampling rate.
            var minValue = 40;
            var maxValue = context.sampleRate / 2;
            // Logarithm (base 2) to compute how many octaves fall in the range.
            var numberOfOctaves = Math.log(maxValue / minValue) / Math.LN2;
            // Compute a multiplier from 0 to 1 based on an exponential scale.
            var multiplier = Math.pow(2, numberOfOctaves * (value - 1.0));
            // Get back to the frequency value between min and max.
            node.frequency.value = maxValue * multiplier;
        }
    };
    
    var setBiquadFilterQuality = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.Q.value = value * 30;
        }
    };

    var getDestinationNumberOfChannels = function() {
        var num = 0;
        if (context) {
            num = context.destination.numberOfChannels;
        }
        return num;
    };

    function setSourceBuffer(id, buffer, passData) {
        var source = nodes[id];
        if (source) {
            source.buffer = buffer;
            Pubsub.publish(EVENTS.SOURCE_BUFFER_SET, {
                id: id,
                data: passData
            });
        }
    }

    function setConvolverBuffer(id, buffer, passData) {
        var node = nodes[id];
        if (node) {
            node.buffer = buffer;
            Pubsub.publish(EVENTS.CONVOLVER_BUFFER_SET, {
                id: id,
                data: passData
            });
        }
    }
    
    function getContext() {
        try {
            var context;
            if (typeof AudioContext == "function") {
                context = new AudioContext();
            } else if (typeof webkitAudioContext == "function") {
                context = new webkitAudioContext();
            }
        } catch(e) {
            console.log('Web Audio API is not supported in this browser');
            return;
        }
        
        return context;
    }
    
    function makeConnection(config) {
        var sourceNode = nodes[config.source],
            targetNode = nodes[config.target];

        if (sourceNode && targetNode) {
            sourceNode.connect(targetNode);
            connections.push(config);
        }
    }

    function createDestination(id) {
        var locContext = context;
        if (destinations.count) {
            locContext = getContext();
        }
        if (locContext) {
            destinations[id] = locContext.destination;
            destinations.count++;
            nodes[id] = locContext.destination;
            nodes.count++;
            
            return locContext.destination;
        }
    }

    function createSource(id, buffer) {
        var source = context.createBufferSource();

        if (buffer) {
            source.buffer = buffer;
        }
        if (!(id in sources)) {
            sources.count++;
        }
        sources[id] = source;
        if (!(id in nodes)) {
            nodes.count++;
        }
        nodes[id] = source;

        return source;
    }

    function createDelayNode(id) {
        var delayNode = context.createDelayNode(100);
        delayNodes[id] = delayNode;
        delayNodes.count++;
        nodes[id] = delayNode;
        nodes.count++;
        
        return delayNode;
    }

    function createGainNode(id) {
        var node = context.createGainNode();
        gainNodes[id] = node;
        gainNodes.count++;
        nodes[id] = node;
        nodes.count++;

        return node;
    }

    function createPannerNode(id) {
        var node = context.createPanner();
        node.panningModel = node.EQUALPOWER;
        pannerNodes[id] = node;
        pannerNodes.count++;
        nodes[id] = node;
        nodes.count++;

        return node;
    }

    function createConvolverNode(id) {
        var node = context.createConvolver();
        convolverNodes[id] = node;
        convolverNodes.count++;
        nodes[id] = node;
        nodes.count++;

        return node;
    };
    
    function createCompressorNode(id) {
        var node = context.createDynamicsCompressor();
        compressorNodes[id] = node;
        compressorNodes.count++;
        nodes[id] = node;
        nodes.count++;

        return node;
    }

    function createBiquadFilterNode(id) {
        var node = context.createBiquadFilter();
        biquadFilterNodes[id] = node;
        biquadFilterNodes.count++;
        nodes[id] = node;
        nodes.count++;

        return node;
    }

    return {
        EVENTS: EVENTS,
        initialize: initialize,
        createNode: createNode,
        setSourceAudio: setSourceAudio,
        playSource: playSource,
        stopSource: stopSource,
        connect: connect,
        disconnect: disconnect,
        setDelayValue: setDelayValue,
        setGainValue: setGainValue,
        setPannerPosition: setPannerPosition,
        setConvolverIR: setConvolverIR,
        setCompressorThreshold: setCompressorThreshold,
        setCompressorRatio: setCompressorRatio,
        setBiquadFilterType: setBiquadFilterType,
        setBiquadFilterFrequency: setBiquadFilterFrequency,
        setBiquadFilterQuality: setBiquadFilterQuality,
        getDestinationNumberOfChannels: getDestinationNumberOfChannels
    };
});