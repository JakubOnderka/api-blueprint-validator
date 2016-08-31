var fs = require('fs'),
  protagonist = require('protagonist'),
  jsonParser = require('jsonlint').parser,
  util = require('util');

function lineNumberFromCharacterIndex(string, index) {
  return string.substring(0, index).split("\n").length;
}

function examples(ast, callback) {
  ast.resourceGroups.forEach(function (resourceGroup) {
    resourceGroup.resources.forEach(function (resource) {
      resource.actions.forEach(function (action) {
        action.examples.forEach(function (example) {
          callback(example, action, resource, resourceGroup);
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

function getJsonsFromRequestOrResponse(requestOrResponse) {
  if (!isJsonContentType(requestOrResponse.headers)) {
    return [];
  }

  var jsons = [];

  if (requestOrResponse.body != '') {
    jsons.push(requestOrResponse.body);
  }

  if (requestOrResponse.schema != '') {
    jsons.push(requestOrResponse.schema);
  }

  return jsons;
}

function isValidRequestOrResponse(json) {
  try {
    jsonParser.parse(json);
  } catch (e) {
    return e;
  }

  return true;
}

function errorPosition(example, action, resource, resourceGroup) {
  var output = [];
  if (resourceGroup.name) {
    output.push('group "' + resourceGroup.name + '"');
  }
  if (resource.name) {
    output.push('resource "' + resourceGroup.name + '"');
  } else {
    output.push('resouce "' + resource.uriTemplate + '"');
  }
  if (action.name) {
    output.push('action "' + action.name + '"');
  }
  if (example.name) {
    output.push('example "' + example.name + '"');
  }

  return 'in ' + output.join(', ');
}

module.exports = function (fileName, validateRequests, validateResponses) {
  fs.readFile(fileName, 'utf8', function (error, data) {
    if (error) {
      console.error('Could not open ' + fileName);
      return;
    }

    protagonist.parse(data, {type: 'ast'}, function (error, result) {
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

      examples(result.ast, function (example, action, resource, resourceGroup) {
        if (validateRequests) {
          example.requests.forEach(function (request) {
            var jsons = getJsonsFromRequestOrResponse(request);
            jsons.forEach(function (json) {
              var valid = isValidRequestOrResponse(json);
              if (valid !== true) {
                var message = '    ' + valid.message.replace(/\n/g, '\n    ');
                var position = errorPosition(example, action, resource, resourceGroup);
                errors.push('Error in JSON request ' + position + '\n' + message + '\n\nJSON:' + util.inspect(json, false, null));
              }
            });
          });
        }

        if (validateResponses) {
          example.responses.forEach(function (response) {
            var jsons = getJsonsFromRequestOrResponse(response);
            jsons.forEach(function (json) {
              var valid = isValidRequestOrResponse(json);
              if (valid !== true) {
                var message = '    ' + valid.message.replace(/\n/g, '\n    ');
                var position = errorPosition(example, action, resource, resourceGroup);
                errors.push('Error in JSON response ' + position + '\n' + message + '\n\nJSON:' + util.inspect(json, false, null));
              }
            });
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
