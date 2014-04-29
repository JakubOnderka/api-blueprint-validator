var fs = require('fs'),
  protagonist = require('protagonist'),
  jsonParser = require('jsonlint').parser;

function lineNumberFromCharacterIndex(string, index) {
  return string.substring(0, index).split("\n").length;
}

function examples(ast, callback) {
  for (var i in ast.resourceGroups) {
    var resourceGroup = ast.resourceGroups[i];

    for (var j in resourceGroup.resources) {
      var resource = resourceGroup.resources[j];

      for (var k in resource.actions) {
        var action = resource.actions[k];

        for (var l in action.examples) {
          var example = action.examples[l];

          callback(example, action, resource);
        }
      }
    }
  }
}

function isJsonResponse(response) {
  for (var i in response.headers) {
    var header = response.headers[i];

    if (header.name === 'Content-Type') {
      return header.value === 'application/json';
    }
  }

  return false;
}

function isResponseValid(response) {
  if (isJsonResponse(response)) {
    try {
      jsonParser.parse(response.body);
    } catch (e) {
      return e;
    }
  }

  return true;
}

module.exports = function (fileName) {
  fs.readFile(fileName, 'utf8', function (error, data) {
    if (error) {
      console.error('Could not open ' + fileName);
      return;
    }

    protagonist.parse(data, function (error, result) {
      if (error) {
        var lineNumber = lineNumberFromCharacterIndex(data, error.location[0].index);
        console.error('Error: ' + error.message + ' on line ' + lineNumber);
        process.exit(1);
      }

      for (var j in result.warnings) {
        var lineNumber = lineNumberFromCharacterIndex(data, result.warnings[j].location[0].index);
        console.error('Warning: ' + result.warnings[j].message + ' on line ' + lineNumber);
      }

      var errors = [];

      examples(result.ast, function (example, action, resource) {
        for (var i in example.responses) {
          var response = example.responses[i];
          var valid = isResponseValid(response);
          if (valid !== true) {
            var errorMessage = '    ' + valid.message.replace(/\n/g, '\n    ');
            errors.push("Error in JSON response '" + response.name + "' for action '" + action.name + "' in '" + resource.name + "':\n" + errorMessage);
          }
        }
      });

      if (errors.length > 0) {
        console.error(errors.join('\n\n'));
        process.exit(1);
      }
    });
  });
};
