'use strict';

var githubHelper = require('./lib/githubHelper');

function run() {
    githubHelper.init(
        {
            user: 'yyscamper',
            repo: 'on-tasks',
            token: 'ReplaceWithYourOwnApiKey'
        }
    );
    setInterval(function() {
        console.log('.');

        githubHelper.poll().then(function(result) {
            if (result.length > 0) {
                process.exit(0);
            }
        })
        .then(function() {

        })
        .catch(function(err) {
            console.log(err);
        }).finally(function() {
        });
    }, 5000);
}

process.on('SIGINT', function() {
    console.log('exit app..');
    process.exit(1);
});

try {
    run();
} catch (err) {
    console.log(err.message);
}

