define([
    "jquery",
    "jsplumb",
    "mustache",
    "pubsub",
    "text!templates/destination.mustache",
    "text!templates/source.mustache",
    "text!templates/delay.mustache",
    "text!templates/gain.mustache",
    "text!templates/panner.mustache",
    "text!templates/convolver.mustache",
    "text!templates/compressor.mustache",
    "text!templates/biquad_filter.mustache",
    "jqueryui"
],

function($, jsPlumb, Mustache, Pubsub, destination, source, delay, gain,
        panner, convolver, compressor, biquadFilter) {
    var nodes = [], // Track all nodes on stage
        nodeId = 0,
        sourceEndpointColor = "#316b31",
        sourceEndpoint = {
            isSource: true,
            endpoint: ["Dot", { radius: 15 }],
            paintStyle: { fillStyle: sourceEndpointColor },
            connectorStyle: { strokeStyle: sourceEndpointColor, lineWidth: 8 },
            connector: ["Bezier", { curviness: 63 } ],
            anchor: ["BottomCenter"]
        },
        targetEndpointColor = "#0000ff",
        targetEndpoint = {
            isTarget: true,
            endpoint: "Rectangle",
            paintStyle: { fillStyle: targetEndpointColor },
            connectorStyle: { strokeStyle: targetEndpointColor, lineWidth: 8 },
            connector: ["Bezier", { curviness: 63 } ],
            anchor: ["TopCenter"]
        },
        $stage,
        env;

    // Define the stage events
    var EVENTS = {
        CONNECTION: "stage.connection.connect",
        DISCONNECTION: "stage.connection.disconnect",
        NODE_REQUEST: "stage.node.request",
        SOURCE_PLAY: "stage.source.play",
        SOURCE_STOP: "stage.source.stop",
        SOURCE_PAUSE: "stage.source.pause",
        SOURCE_SET: "stage.source.set",
        DELAY_CHANGE: "stage.delay.change",
        GAIN_CHANGE: "stage.gain.change",
        PANNER_POSITION_CHANGE: "stage.panner.position_change",
        CONVOLVER_SET: "stage.convolver.set",
        COMPRESSOR_THRESHOLD_CHANGE: "stage.compressor.threshold_change",
        COMPRESSOR_RATIO_CHANGE: "stage.compressor.ratio_change",
        BIQUAD_FILTER_TYPE_CHANGE: "stage.biquad_filter.type_change",
        BIQUAD_FILTER_FREQUENCY_CHANGE: "stage.biquad_filter.frequency_change",
        BIQUAD_FILTER_QUALITY_CHANGE: "stage.biquad_filter.quality_change"
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

    var initialize = function(stageId, ienv) {
        env = ienv;
        // Wait for dom to load
        $(function() {
            $stage = $(stageId);

            // Initialize jsPlumb
            jsPlumb.importDefaults({
                DropOptions: {
                    tolerance: 'touch',
                    hoverClass: 'dropHover',
                    activeClass: 'dragActive'
                },
                DragOptions: { cursor: "pointer", zIndex: 2000 },
                PaintStyle: { strokeStyle: '#666' },
                EndpointStyle: { width: 20, height: 16, strokeStyle: '#666' },
                Endpoint: "Rectangle",
                Anchor: [ "AutoDefault" ]
            });

            // Publish connection and disconnection events
            jsPlumb.bind("jsPlumbConnection", function(info) {
                Pubsub.publish(EVENTS.CONNECTION, info);
            });
            jsPlumb.bind("jsPlumbConnectionDetached", function(info) {
                Pubsub.publish(EVENTS.DISCONNECTION, info);
            });

            // Initialize the node menu
            var menuNodesSelector = ".node-menu .node";
            $(menuNodesSelector).draggable({
                helper: "clone",
                opacity: 0.55
            });

            // Initialize the stage
            $stage.droppable({
                accept: menuNodesSelector,
                drop: function(event, ui) {
                    var type = ui.draggable.data('type'),
                        position = {
                            top: ui.offset.top,
                            left: ui.offset.left
                        };
                    requestNode(type, position);
                }
            });

            // Create destination node
            requestNode(NODES.DESTINATION, {
                left: $stage.width() - 200,
                top: $stage.height() / 2
            });
        });
    };

    var setEnv = function(env) {
        env = env;
    };

    var addSourceFile = function(info) {
        // Update all source node file selectors
        $(".audio-list").append($('<option/>', {
            "class": 'audio-file',
            html: info.filename
        }).attr("data-url", info.url));
    };

    var addIRFile = function(info) {
        // Update all convolver node ir selectors
        $(".ir-list").append($('<option/>', {
            "class": 'audio-file',
            html: info.filename
        }).attr("data-url", info.url));
    };

    var createNode = function(data) {
        var id = data.info.id,
            type = data.info.type,
            opts = data.info.opts,
            template, init, data, $node;
            
        switch (type) {
            case NODES.DESTINATION:
                template = destination;
                init = initDestinationNode;
                break;
            case NODES.SOURCE:
                template = source;
                init = initSourceNode;
                data = env;
                break;
            case NODES.DELAY:
                template = delay;
                init = initDelayNode;
                break;
            case NODES.GAIN:
                template = gain;
                init = initGainNode;
                break;
            case NODES.PANNER:
                template = panner;
                init = initPannerNode;
                break;
            case NODES.CONVOLVER:
                template = convolver;
                init = initConvolverNode;
                data = env;
                break;
            case NODES.COMPRESSOR:
                template = compressor;
                init = initCompressorNode;
                break;
            case NODES.BIQUAD_FILTER:
                template = biquadFilter;
                init = initBiquadFilterNode;
                break;
            default:
                break;
        }
        if (template) {
            $node = $(Mustache.to_html(template, data)).css({
                position: "absolute",
                top: opts.top + "px",
                left: opts.left + "px"
            }).attr("id", id);
            // Save and append node
            nodes.push($node);
            $stage.append($node);
            jsPlumb.draggable(id);
            if (typeof init === 'function') {
                init($node);
            }
        }
    };

    var enableSourcePlayButton = function(info) {
        var $ctrl = $('#' + info.id + ' .play-stop').removeClass('disabled');
    };
    
    var disableSourcePlayButton = function(info) {
        var $ctrl = $('#' + info.id + ' .play-stop').addClass('disabled');
    };
    
    var enableSourcePauseButton = function(info) {
        var $ctrl = $('#' + info.id + ' .pause').removeClass('disabled');
    };
    
    var disableSourcePauseButton = function(info) {
        var $ctrl = $('#' + info.id + ' .pause').addClass('disabled');
    };
    
    var startSourceProgressBar = function(info) {
        var id = info.id,
            bufferSet = !!info.state.node.buffer,
            playOffset = info.state.playOffset,
            duration = bufferSet ? info.state.node.buffer.duration : 1,
            percent = (playOffset / duration) * 100,
            unitPercent = (1 / duration) * 100,
            $container = $('#' + id + ' .progress-bar-container'),
            $bar = $('#' + id + ' .progress-bar');
        
        $bar.width(percent + '%');
        if ($container.data('timer')) {
            clearInterval($container.data('timer'));
        }
        $container.data('timer', setInterval(function() {
            var curPercent = ($bar.width() / $container.width()) * 100,
                p = Math.min(100, curPercent + unitPercent);
            $bar.width(p + '%');
            if (p === 100) {
                clearInterval($container.data('timer'));
            }
        }, 1000));
    };
    
    var stopSourceProgressBar = function(info) {
        var id = info.id,
            bufferSet = !!info.state.node.buffer,
            playOffset = info.state.playOffset,
            duration = bufferSet ? info.state.node.buffer.duration : 1,
            percent = (playOffset / duration) * 100,
            unitPercent = (1 / duration) * 100,
            $container = $('#' + id + ' .progress-bar-container'),
            $bar = $('#' + id + ' .progress-bar');

        clearInterval($container.data('timer'));
        $bar.width(percent + '%');
    };
/*
    var updateSourceNode = function(info) {
        var id = info.id,
            bufferSet = !!info.state.node.buffer,
            usingMic = info.state.mic,
            connected = info.state.destConnected,
            playOffset = info.state.playOffset,
            duration = bufferSet ? info.state.node.buffer.duration : 1,
            playbackState = info.state.node.playbackState,
            $node = $('#' + id),
            $select = $('#' + id + ' .audio-list'),
            $playStop = $('#' + id + ' .play-stop'),
            $pause = $('#' + id + ' .pause');

        
    };
*/
    var setSourceControlType = function(info) {
        var id = info.id,
            type = info.type,
            $ctrl = $('#' + id + ' .play-stop');
        if (type === 'play') {
            $ctrl.data('type', "play").text('Play');
        } else if (type === 'stop') {
            $ctrl.data('type', "stop").text('Stop');
        }
    };
    
    var setSourceInput = function(info) {
        var id = info.id,
            url = info.url;
        $('#' + id + ' .audio-list').prop('disabled', false).find("option").filter(function() {
            return $(this).data('url') && $(this).data('url') == url;
        }).prop('selected', true);
    };
    
    var setConvolverIR = function(info) {
        var id = info.id,
            url = info.url;
        $('#' + id + ' .ir-list').prop('disabled', false).find("option").filter(function() {
            return $(this).data('url') && $(this).data('url') == url;
        }).prop('selected', true);
    };

    function requestNode(type, opts) {
        var id = "node-" + nodeId++;

        for (t in NODES) {
            if (NODES[t] === type) {
                Pubsub.publish(EVENTS.NODE_REQUEST, {
                    type: type,
                    id: id,
                    opts: opts
                });
                break;
            }
        }
    }

    function initDestinationNode($node) {
        var id = $node.attr('id');
        // Add a target endpoint, only on connection allowed
        jsPlumb.addEndpoint(id, {
            // Number of channels supported by hardware
            //maxConnections: env.destinationMaxChannels
            maxConnections: -1
        }, targetEndpoint);
    }

    function initSourceNode($node) {
        var id = $node.attr('id'),
            $select = $node.find('.audio-list'),
            $ctrl = $node.find('.play-stop'),
            $pause = $node.find('.pause');
            
        $ctrl.addClass("disabled").data('type', 'play');
        $pause.addClass("disabled");
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        // Publish play and stop and pause events
        $ctrl.on('click', function() {
            var $this = $(this),
                data = { id: id };
            if ($this.hasClass('disabled')) return;
            if ($this.data('type') === 'play') {
                Pubsub.publish(EVENTS.SOURCE_PLAY, data);
            } else if ($this.data('type') == 'stop') {
                Pubsub.publish(EVENTS.SOURCE_STOP, data);
            }
        });
        $pause.on('click', function() {
            var $this = $(this),
                data = { id: id };
            if ($this.hasClass('disabled')) return;
            Pubsub.publish(EVENTS.SOURCE_PAUSE, data);
        });

        $select.on('change', function() {
            var $selected = $select.find('option:selected');
            if ($selected.hasClass('upload-file')) {
                $(this).prop('disabled', true);
                Pubsub.publish(EVENTS.SOURCE_SET, { id: id });
            } else if ($selected.hasClass("audio-file")) {
                $(this).prop('disabled', true);
                Pubsub.publish(EVENTS.SOURCE_SET, {
                    id: id,
                    url: $selected.data('url')
                });
            } else if ($selected.hasClass("use-mic")) {
                $(this).prop('disabled', true);
                Pubsub.publish(EVENTS.SOURCE_SET, {
                    id: id,
                    mic: true
                });
            }
        });
    }
    
    function initDelayNode($node) {
        var id = $node.attr('id'),
            $input = $('#' + id + ' .delay-input'),
            $value = $('#' + id + ' .delay-value');

        jsPlumb.addEndpoint(id, { maxConnections: -1 }, targetEndpoint);
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        $input.on('change', function() {
            var delay = parseInt($(this).val(), 10);
            $value.html(delay + " sec");
            Pubsub.publish(EVENTS.DELAY_CHANGE, {
                id: id,
                value: delay
            });
        });
        $input.val(0);
    }
    
    function initGainNode($node) {
        var id = $node.attr('id'),
            $input = $('#' + id + ' .gain-input'),
            $value = $('#' + id + ' .gain-value');

        jsPlumb.addEndpoint(id, { maxConnections: -1 }, targetEndpoint);
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        $input.on('change', function() {
            var gain = parseFloat($(this).val(), 10);
            $value.html(gain);
            Pubsub.publish(EVENTS.GAIN_CHANGE, {
                id: id,
                value: gain
            });
        });
        $input.val(1);
    }
    
    function initPannerNode($node) {
        var id = $node.attr('id'),
            $input = $('#' + id + ' .panner-input'),
            $value = $('#' + id + ' .panner-value');

        jsPlumb.addEndpoint(id, { maxConnections: -1 }, targetEndpoint);
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        $input.on('change', function() {
            var val = parseFloat($(this).val(), 10);
            $value.html(val);
            Pubsub.publish(EVENTS.PANNER_POSITION_CHANGE, {
                id: id,
                position: { x: val, y: 0, z: 0 }
            });
        });
        $input.val(0);
    }
    
    function initConvolverNode($node) {
        var id = $node.attr('id'),
            $select = $node.find('.ir-list');

        jsPlumb.addEndpoint(id, { maxConnections: -1 }, targetEndpoint);
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        $select.on('change', function() {
            var $selected = $select.find('option:selected');
            if ($selected.hasClass('upload-file')) {
                $(this).prop('disabled', true);
                Pubsub.publish(EVENTS.CONVOLVER_SET, { id: id });
            } else if ($selected.hasClass("audio-file")) {
                $(this).prop('disabled', true);
                Pubsub.publish(EVENTS.CONVOLVER_SET, {
                    id: id,
                    url: $selected.data('url')
                });
            }
        });
    }
    
    function initCompressorNode($node) {
        var id = $node.attr('id'),
            $thresholdInput = $('#' + id + ' .threshold-input'),
            $thresholdValue = $('#' + id + ' .threshold-value'),
            $ratioInput = $('#' + id + ' .ratio-input'),
            $ratioValue = $('#' + id + ' .ratio-value');

        jsPlumb.addEndpoint(id, { maxConnections: -1 }, targetEndpoint);
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        $thresholdInput.on('change', function() {
            var val = parseFloat($(this).val(), 10);
            $thresholdValue.html(val + "dB");
            Pubsub.publish(EVENTS.COMPRESSOR_THRESHOLD_CHANGE, {
                id: id,
                value: val
            });
        });
        $thresholdInput.val(-24);

        $ratioInput.on('change', function() {
            var val = parseFloat($(this).val(), 10);
            $ratioValue.html(val);
            Pubsub.publish(EVENTS.COMPRESSOR_RATIO_CHANGE, {
                id: id,
                value: val
            });
        });
        $ratioInput.val(12);
    }

    function initBiquadFilterNode($node) {
        var id = $node.attr('id'),
            $select = $node.find('.filter-list'),
            $frequencyInput = $('#' + id + ' .frequency-input'),
            $frequencyValue = $('#' + id + ' .frequency-value'),
            $qualityInput = $('#' + id + ' .quality-input'),
            $qualityValue = $('#' + id + ' .quality-value');

        jsPlumb.addEndpoint(id, { maxConnections: -1 }, targetEndpoint);
        jsPlumb.addEndpoint(id, { maxConnections: -1 }, sourceEndpoint);

        $select.on('change', function() {
            var $selected = $select.find('option:selected');
            Pubsub.publish(EVENTS.BIQUAD_FILTER_TYPE_CHANGE, {
                id: id,
                value: $selected.val()
            });
        });
        
        $frequencyInput.on('change', function() {
            var val = parseFloat($(this).val(), 10);
            $frequencyValue.html(val + "Hz");
            Pubsub.publish(EVENTS.BIQUAD_FILTER_FREQUENCY_CHANGE, {
                id: id,
                value: val
            });
        });
        $frequencyInput.val(1);

        $qualityInput.on('change', function() {
            var val = parseFloat($(this).val(), 10);
            $qualityValue.html(val);
            Pubsub.publish(EVENTS.COMPRESSOR_QUALITY_CHANGE, {
                id: id,
                value: val
            });
        });
        $qualityInput.val(0);
    }

    return {
        EVENTS: EVENTS,
        initialize: initialize,
        setEnv: setEnv,
        addSourceFile: addSourceFile,
        addIRFile: addIRFile,
        createNode: createNode,
        enableSourcePlayButton: enableSourcePlayButton,
        disableSourcePlayButton: disableSourcePlayButton,
        enableSourcePauseButton: enableSourcePauseButton,
        disableSourcePauseButton: disableSourcePauseButton,
        stopSourceProgressBar: stopSourceProgressBar,
        startSourceProgressBar: startSourceProgressBar,
        setSourceControlType: setSourceControlType,
        setSourceInput: setSourceInput,
        setConvolverIR: setConvolverIR
    };
});