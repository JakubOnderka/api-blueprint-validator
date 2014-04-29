var fs = require('fs'),
  protagonist = require('protagonist'),
  jsonParser = require('jsonlint').parser;

function lineNumberFromCharacterIndex(string, index) {
  return string.substring(0, index).split("\n").length;
}

function examples(ast, callback) {
  ast.resourceGroups.forEach(function (resourceGroup) {
    resourceGroup.resources.forEach(function (resource) {
      resource.actions.forEach(function (action) {
        action.examples.forEach(function (example) {
          callback(example, action, resource);
        });
      });
    });
  });
}

function isJsonContentType(headers) {
  return headers.some(function (header) {
    return header.name === 'Content-Type' && header.value === 'application/json';
  });
}

function isValidRequestOrResponse(requestOrResponse) {
  if (isJsonContentType(requestOrResponse.headers)) {
    try {
      var body = requestOrResponse.body;
      jsonParser.parse(body);
    } catch (e) {
      return e;
    }
  }

  return true;
}

module.exports = function (fileName, validateRequests, validateResponses) {
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

      result.warnings.forEach(function (warning) {
        var lineNumber = lineNumberFromCharacterIndex(data, warning.location[0].index);
        console.error('Warning: ' + warning.message + ' on line ' + lineNumber);
      });

      var errors = [];

      examples(result.ast, function (example, action, resource) {
        if (validateRequests) {
          example.requests.forEach(function (request) {
            var valid = isValidRequestOrResponse(request);
            if (valid !== true) {
              var errorMessage = '    ' + valid.message.replace(/\n/g, '\n    ');
              errors.push("Error in JSON request for action '" + action.name + "' in '" + resource.name + "':\n" + errorMessage);
            }
          });
        }

        if (validateResponses) {
          example.responses.forEach(function (response) {
            var valid = isValidRequestOrResponse(response);
            if (valid !== true) {
              var errorMessage = '    ' + valid.message.replace(/\n/g, '\n    ');
              errors.push("Error in JSON response '" + response.name + "' for action '" + action.name + "' in '" + resource.name + "':\n" + errorMessage);
            }
          });
        }
      });

      if (errors.length > 0) {
        console.error(errors.join('\n\n'));
        process.exit(1);
      }
    });
  });
};
