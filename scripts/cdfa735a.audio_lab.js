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
        context,
        micSource;

    // Define audio events
    var EVENTS = {
        NODE_CREATE: "audio.node.create",
        SOURCE_PLAY: "audio.source.play",
        SOURCE_STOP: "audio.source.stop",
        SOURCE_PAUSE: "audio.source.pause",
        SOURCE_BUFFER_SET: "audio.source.buffer_set",
        CONVOLVER_BUFFER_SET: "audio.convolver.buffer_set",
        NODE_CHANGE: "audio.node.change"
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

    var nodeConfigs = {
        crossfade: {
            nodes: [
                {
                    id: 0,
                    type: NODES.GAIN
                },
                {
                    id: 1,
                    type: NODES.GAIN
                },
                {
                    id: 2,
                    type: NODES.GAIN
                }
            ],
            connections: [
                {
                    source: 0,
                    target: 2
                },
                {
                    source: 1,
                    target: 2
                }
            ],
            inputs: [
                {
                    node: 0
                },
                {
                    node: 1
                }
            ],
            output: [
                {
                    node: 2
                }
            ],
            controls: [
                {
                    name: 'crossfade',
                    type: 'range',
                    min: 0,
                    max: 1,
                    init: 0,
                    change: function(value) {
                        var gain1 = Math.cos(value * 0.5*Math.PI);
                        var gain2 = Math.cos((1.0 - value) * 0.5*Math.PI);
                        this.getNode(0).gain.value = gain1;
                        this.getNode(1).gain.value = gain2;
                    }
                }
            ]
        }
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
            Pubsub.publish(EVENTS.NODE_CREATE, { info: info, state: node });
        }
    };

    var setSourceAudio = function(id, bufferData, passData, autoPlay) {
        var source = nodes[id];
        if (source) {
            if (source.isMic) {
                source = createSource(id);
            }
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
    
    var setSourceMic = function(id) {
        var source = nodes[id];
        if (source) {
            if (!navigator.webkitGetUserMedia) {
                console.log("Browser does not support webkitGetUserMedia");
                Pubsub.publish(EVENTS.SOURCE_MIC_FAIL, { id: id, state: source });
            }
            if (!micSource) {
                try {
                    navigator.webkitGetUserMedia({audio:true}, function(stream) {
                        micSource = wrapNode(context.createMediaStreamSource(stream));
                        micSource.isMic = true;
                        
                        var connections = disconnect({ source: id }, true);
                        nodes[id] = micSource;
                        connect(connections, true);
                        Pubsub.publish(EVENTS.SOURCE_MIC_SET, { id: id, state: micSource });
                    });
                } catch (e) {
                    console.log("Error occured while requesting mic");
                    Pubsub.publish(EVENTS.SOURCE_MIC_FAIL, { id: id, state: source });
                }
            } else {
                var connections = disconnect({ source: id }, true);
                nodes[id] = micSource;
                connect(connections, true);
                Pubsub.publish(EVENTS.SOURCE_MIC_SET, { id: id, state: micSource });
            }
        };
    };

    var playSource = function(id) {
        var node = nodes[id];
        if (node) {
            var source = node.node;
            // FINISHED_STATE is the final state of source so check if we need a new source node
            if (source.playbackState === source.FINISHED_STATE) {
                var connections = disconnect({ source: id }, true);
                node = createSource(id, source.buffer, {
                    playOffset: node.playOffset,
                    destConnected: node.destConnected
                });
                source = node.node;
                connect(connections, true);
            }
            var duration = source.buffer.duration - node.playOffset;
            if (source.noteGrainOn) {
                source.noteGrainOn(context.currentTime, node.playOffset, duration);
            } else if (source.noteOn) {
                source.noteOn(context.currentTime, node.playOffset, duration);
            } else {
                source.start(context.currentTime, node.playOffset, duration);
            }
            node.playStartTime = context.currentTime;
            node.timer = setTimeout(function() {
                node.playOffset = 0;
                Pubsub.publish(EVENTS.SOURCE_STOP, { id: id, state: node });
            }, duration * 1000);
            Pubsub.publish(EVENTS.SOURCE_PLAY, { id: id, state: node });
        }
    };

    var stopSource = function(id) {
        var node = nodes[id];
        if (node) {
            var source = node.node;
            if (source.noteOff) {
                source.noteOff(context.currentTime);
            } else {
                source.stop(context.currentTime);
            }
            node.playOffset = 0;
            if (node.timer) {
                clearTimeout(node.timer);
            }
            Pubsub.publish(EVENTS.SOURCE_STOP, { id: id, state: node });
        }
    };
    
    var pauseSource = function(id) {
        var node = nodes[id];
        if (node) {
            var source = node.node;
            if (source.noteOff) {
                source.noteOff(context.currentTime);
            } else {
                source.stop(context.currentTime);
            }
            node.playOffset += context.currentTime - node.playStartTime;
            if (node.timer) {
                clearTimeout(node.timer);
            }
            Pubsub.publish(EVENTS.SOURCE_PAUSE, { id: id, state: node });
        }
    };

    var connect = function(config, silent) {
        if (config instanceof Array) {
            for (var i = 0; i < config.length; i++) {
                makeConnection(config[i]);
            }
        } else {
            makeConnection(config);
        }
        
        if (!silent) {
            updateConnectionStates(config.source);
        }
    };

    var disconnect = function(config, silent) {
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
                sourceNode.node.disconnect(targetNode.node);
                removedConnections.push(con);
            }
        }
        connections = resConnections;
        
        if (!silent) {
            updateConnectionStates(config.source);
        }
        return removedConnections;
    };

    var setDelayValue = function(id, delay) {
        var delayNode = nodes[id];
        if (delayNode) {
            delayNode.node.delayTime.value = delay;
        }
    };

    var setGainValue = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.node.gain.value = value;
        }
    };

    var setPannerPosition = function(id, pos) {
        var node = nodes[id];
        if (node) {
            node.node.setPosition(pos.x, pos.y, pos.z);
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
            node.node.threshold.value = value;
        }
    };

    var setCompressorRatio = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.node.ratio.value = value;
        }
    };
    
    var setBiquadFilterType = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.node.type = value;
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
            node.node.frequency.value = maxValue * multiplier;
        }
    };
    
    var setBiquadFilterQuality = function(id, value) {
        var node = nodes[id];
        if (node) {
            node.node.Q.value = value * 30;
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
            source.node.buffer = buffer;
            source.playOffset = 0;
            if (source.node.playbackState != source.node.UNSCHEDULED_STATE) {
                source.playStartTime = context.currentTime;
                if (source.timer) {
                    clearTimeout(source.timer);
                }
                var duration = buffer.duration - source.playOffset;
                source.timer = setTimeout(function() {
                    source.playOffset = 0;
                    Pubsub.publish(EVENTS.SOURCE_STOP, { id: id, state: source });
                }, duration * 1000);
                Pubsub.publish(EVENTS.SOURCE_PLAY, { id: id, data: passData, state: source });
            } else {
                Pubsub.publish(EVENTS.SOURCE_STOP, { id: id, data: passData, state: source });
            }
            Pubsub.publish(EVENTS.SOURCE_BUFFER_SET, {
                id: id,
                data: passData,
                state: source
            });
        }
    }

    function setConvolverBuffer(id, buffer, passData) {
        var node = nodes[id];
        if (node) {
            node.node.buffer = buffer;
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
            sourceNode.node.connect(targetNode.node);
            connections.push(config);
        }
    }
    
    function updateConnectionStates(sourceId, updated) {
        var source = nodes[sourceId];
        if (!source) return;
        updated || (updated = []);

        //TODO: need to make this more efficient
        // Check if we have already been to this node
        for (var i = 0; i < updated.length; i++) {
            if (sourceId === updated[i]) return;
        }

        for (var i = 0; i < connections.length; i++) {
            var con = connections[i];
            if (con.source == sourceId && nodes[con.target] && nodes[con.target].destConnected) {
                if (!source.destConnected) {
                    // The node just became connected to destination
                    source.destConnected = true;
                    updated.push(sourceId);
                    Pubsub.publish(EVENTS.NODE_CHANGE, { id: sourceId, state: source });
                    for (var j = 0; j < connections.length; j++) {
                        if (connections[j].target == sourceId) {
                            updateConnectionStates(connections[j].source, updated);
                        }
                    }
                }
                return;
            }
        }
        if (source.destConnected) {
            // The node just got disconnected from destination
            source.destConnected = false;
            updated.push(sourceId);
            Pubsub.publish(EVENTS.NODE_CHANGE, { id: sourceId, state: source });
            for (var j = 0; j < connections.length; j++) {
                if (connections[j].target == sourceId) {
                    updateConnectionStates(connections[j].source, updated);
                }
            }
        }
    }
    
    function wrapNode(node, destConnected, opts) {
        var wrap = {
            node: node,
            destConnected: destConnected
        };
        
        if (opts) {
            for (var key in opts) {
                wrap[key] = opts[key];
            }
        }
        
        return wrap;
    }

    function createDestination(id) {
        var locContext = context;
        if (destinations.count) {
            locContext = getContext();
        }
        if (locContext) {
            var wrap = wrapNode(locContext.destination, true);
            destinations[id] = locContext.destination;
            destinations.count++;
            nodes[id] = wrap;
            nodes.count++;
            
            return wrap;
        }
    }

    function createSource(id, buffer, opts) {
        var source = context.createBufferSource();
        opts || (opts = { playOffset: 0 });
        
        if (buffer) {
            source.buffer = buffer;
            opts.duration = buffer.duration;
        }
        if (!(id in sources)) {
            sources.count++;
        }
        sources[id] = source;
        
        var wrap = wrapNode(source, false, opts);
        if (!(id in nodes)) {
            nodes.count++;
        }
        nodes[id] = wrap;

        return wrap;
    }

    function createDelayNode(id) {
        var node = context.createDelayNode(100),
            wrap = wrapNode(node, false);
            
        delayNodes[id] = node;
        delayNodes.count++;
        nodes[id] = wrap;
        nodes.count++;
        
        return wrap;
    }

    function createGainNode(id) {
        var node = context.createGainNode(),
            wrap = wrapNode(node, false);
            
        gainNodes[id] = node;
        gainNodes.count++;
        nodes[id] = wrap;
        nodes.count++;

        return wrap;
    }

    function createPannerNode(id) {
        var node = context.createPanner();
        node.panningModel = node.EQUALPOWER;
        pannerNodes[id] = node;
        pannerNodes.count++;
        var wrap = wrapNode(node, false);
        nodes[id] = wrap;
        nodes.count++;

        return wrap;
    }

    function createConvolverNode(id) {
        var node = context.createConvolver(),
            wrap = wrapNode(node, false);
            
        convolverNodes[id] = node;
        convolverNodes.count++;
        nodes[id] = wrap;
        nodes.count++;

        return wrap;
    };
    
    function createCompressorNode(id) {
        var node = context.createDynamicsCompressor(),
            wrap = wrapNode(node, false);
            
        compressorNodes[id] = node;
        compressorNodes.count++;
        nodes[id] = wrap;
        nodes.count++;

        return wrap;
    }

    function createBiquadFilterNode(id) {
        var node = context.createBiquadFilter(),
            wrap = wrapNode(node, false);
            
        biquadFilterNodes[id] = node;
        biquadFilterNodes.count++;
        nodes[id] = wrap;
        nodes.count++;

        return wrap;
    }

    return {
        EVENTS: EVENTS,
        initialize: initialize,
        createNode: createNode,
        setSourceAudio: setSourceAudio,
        setSourceMic: setSourceMic,
        playSource: playSource,
        stopSource: stopSource,
        pauseSource: pauseSource,
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