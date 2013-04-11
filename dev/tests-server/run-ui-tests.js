
const SERVER = require("../server");
const GRUNT = require("grunt");


describe("run-ui-tests", function() {

    it("grunt-phantomjs", function(done) {

        this.timeout(60 * 1000);

        return SERVER.main(function(err, info) {
            if (err) return done(err);

            GRUNT.initConfig({
                mocha: {
                    all: {
                        options: {
                            reporter: "List",
                            urls: [
                                //"http://localhost:" + info.port + "/test/flow/10-ConnectToFinder"
                                "http://localhost:" + info.port + "/test"
                            ]
                        }
                    }
                }
            });

            GRUNT.loadNpmTasks("grunt-mocha");

            GRUNT.registerInitTask('default', function() {
                GRUNT.task.run(["mocha"]);
            });
            GRUNT.tasks(['default'], {
                //debug: true
            }, function() {
                return info.server.close(function() {
                    return done(null);
                });
            });
        });
    });

});
