// Set the require.js configuration for your application.
require.config({

    // Initialize the application with the main application file.
    deps: ["main"],

    paths: {
        // JavaScript folders.
        libs: "../scripts/vendor",
        bbplugins: "../scripts/vendor/bootstrap",
        
        // Mustache templates
        templates: "../templates",

        // Libraries.
        jquery: "../scripts/vendor/jquery.min",
        jqueryui: "../scripts/vendor/jquery-ui.min",
        jsplumb: "../scripts/vendor/jquery.jsPlumb-1.3.15-all-min",
        mustache: "../scripts/vendor/mustache",
        modernizr: "../scripts/vendor/modernizr.min",
        filepicker: "../scripts/vendor/filepicker",
        pubsub: "../scripts/vendor/pubsub"
    },
    
    shim: {
        'jqueryui': {
            deps: ['jquery']
        },
        'jsplumb': {
            deps: ['jquery', 'jqueryui'],
            exports: 'jsPlumb'
        },
        'mustache': {
            exports: 'Mustache'
        },
        'filepicker': {
            exports: "filepicker"
        }
    }

});
