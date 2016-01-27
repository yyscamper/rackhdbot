'use strict';

var Promise = require('bluebird');
var prettyJson = require('prettyjson');
var _ = require('lodash');
var https = require('https');
var GitHubApi = require('github');
// var fs = Promise.promisifyAll(require('fs'));
var jshint = require('jshint').JSHINT;
var assert = require('assert');

var githubHelper = {};

function print(obj) {
    console.log(prettyJson.render(obj));
}

githubHelper.init = function(options) {
    options = options || {};
    var token = options.token;
    assert.ok(token);

    var repo = options.repo;
    var user = options.user;

    assert.ok(repo);
    assert.ok(user);

    this.repo = repo;
    this.user = user;

    this.github = new GitHubApi({
        version: '3.0.0',
        debug: false,
        protocol: 'https',
        headers: {
            'user-agent': 'rackhdbot'
        }
    });

    this.github.authenticate({
        type: 'oauth',
        token: token
    });
};

function validEvent(event) {
    if (!event) {
        return false;
    }
    if (!event.payload || !event.payload.action) {
        return false;
    }

    if (event.payload.closed_at || event.payload.merged_at) {
        return false;
    }

    var action = event.payload.action.toLowerCase();
    if (event.type === 'PullRequestEvent') {
        if (_.indexOf(['opened', 'reopened', 'synchronize'], action) === -1) {
            return false;
        }
    }
    else if (event.type === 'PullRequestReviewCommentEvent') {
        if (_.indexOf(['created'], action) === -1) {
            return false;
        }
        if (!event.payload.comment || !event.payload.comment.body ||
            event.payload.comment.body.toLowerCase() !== 'test rackhdbot') {
            return false;
        }
    }

    return true;
}

githubHelper.downloadFile = function (urlPath) {
    var data = '';
    // var urlObj = url.parse(urlPath);
    return new Promise(function (resolve, reject) {
        // var options = {
        //     hostname: urlObj.hostname,
        //     port: urlObj.port,
        //     path: urlObj.path,
        //     method: 'GET',
        //     rejectUnauthorized: false
        // };
        https.get(urlPath, function(resp) {
            if (resp.statusCode === 302) {
                var data1 = '';
                https.get(resp.headers.location, function(resp1) {
                    if (resp1.statusCode < 200 || resp1.statusCode > 299) {
                        reject(new Error('After redirected, Fail to download ' + urlPath +
                                         ', statusCode=' + resp1.statusCode.toString()));
                    }
                    resp1.on('data', function(chunk) {
                        data1 += chunk;
                    });
                    resp1.on('end', function() {
                       resolve(data1);
                    });
                    resp1.on('error', function() {
                        reject(new Error('After redirect, Failed to download file from url ' +
                            urlPath));
                    });
                });
            }
            else if (resp.statusCode < 200 || resp.statusCode > 299) {
                reject(new Error('Fail to download ' + urlPath +
                                 ', statusCode=' + resp.statusCode.toString()));
            }

            resp.on('data', function(chunk) {
                data += chunk;
            });
            resp.on('end', function() {
                if (resp.statusCode !== 302) {
                    resolve(data);
                }
            });
            resp.on('error', function() {
                reject(new Error('Failed to download file from url ' + urlPath));
            });
        });
    });
};

githubHelper.checkEvent = function() {
    var self = this;
    return new Promise( function(resolve, reject) {
        self.github.events.getFromRepo({
            user: self.user,
            repo: self.repo
        }, function(err, res) {
            if (err) {
                reject(err.message);
            }
            else {
                var prEvents = _.filter(res, validEvent);
                var prs = _.map(prEvents, function(v) {
                    if (v.payload) {
                        return v.payload.pull_request;
                    } else {
                        return null;
                    }
                });
                prs = _.compact(prs);
                resolve(prs);
            }
        });
    });
};

githubHelper.getPullRequestFiles = function(pr) {
    var self = this;
    return new Promise(function(resolve, reject) {
        self.github.pullRequests.getFiles({
            user: self.user,
            repo: self.repo,
            number: pr.number
        }, function(err, res) {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    }).then(function(files) {
        files = _.filter(files, function(file) {
            if (!_.endsWith(file.filename, '.js')) {
                return false;
            }
        });

        pr.files = files;
        return Promise.map(files, function(file) {
            //download file via raw_url
            return self.downloadFile(file.raw_url).then(function(fileData) {
                file.rawFileData = fileData;
                print(fileData);
                jshint(fileData);
                file.jshintResult = _.cloneDeep(jshint.errors);
                print(file.jshintResult);
            });
        });
    });
};

githubHelper.poll = function() {
    var self = this;
    return self.checkEvent().then(function(prs) {
        return Promise.map(prs, function(pr) {
            return self.getPullRequestFiles(pr);
        });
    });
};

module.exports = githubHelper;
