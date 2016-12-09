var fs = require('fs'),
  glob = require('glob-fs')({ gitignore: true }),
  isGlob = require('is-glob'),
  protagonist = require('protagonist'),
  jsonParser = require('jsonlint').parser;
  ajv = require('ajv');

function lineNumberFromCharacterIndex(string, index) {
  return string.substring(0, index).split("\n").length;
}

function hasImportantWarning(result,parserOptions) {
  has_important_warnings = False;
  result.warnings.forEach(function(warning) {
    if ((warning.indexOf('expected API name') !== -1) && ! parserOptions.requireBlueprintName) return;
    has_important_warnings = True;
  });
  return has_important_warnings;
}

function lint(file, data, options) {

  function shouldSkip(event) {
    return (!options.requireBlueprintName && event.message.indexOf('expected API name') !== -1 );
  }

  var parserOptions = {
    requireBlueprintName: options.requireBlueprintName,
    type: 'ast'
  };
  
  protagonist.parse(data, parserOptions, function (error, result) {

      if (error) {
        var lineNumber = lineNumberFromCharacterIndex(data, error.location[0].index);
        console.error('(' + file + ')' + ' ' + 'Error: ' + error.message + ' on line ' + lineNumber);
        process.exit(1);
      }

      if(result.wanrings) {
        result.warnings.forEach(function (warning) {
          if (!shouldSkip(warning)) {
            var lineNumber = lineNumberFromCharacterIndex(data, warning.location[0].index);
            console.error('(' + file + ')' + ' ' + 'Warning: ' + warning.message + ' on line ' + lineNumber);
          }
        });
      }

      var errors = [];

      if(result.ast) {
        examples(result.ast, function (example, action, resource, resourceGroup) {
          if (options.validateRequests) {
            example.requests.forEach(function (request) {
              var valid = isValidRequestOrResponse(request);
              if (valid !== true) {
                var message = '    ' + valid.message.replace(/\n/g, '\n    ');
                var position = errorPosition(example, action, resource, resourceGroup);
                errors.push('(' + file + ')' + ' ' + 'Error in JSON request ' + position + '\n' + message);
              }
            });
          }

          if (options.validateResponses) {
            example.responses.forEach(function (response) {
              var valid = isValidRequestOrResponse(response);
              if (valid !== true) {
                var message = '    ' + valid.message.replace(/\n/g, '\n    ');
                var position = errorPosition(example, action, resource, resourceGroup);
                errors.push('(' + file + ')' + ' ' + 'Error in JSON response ' + position + '\n' + message);
              }
            });
          }
        });
      }
      else console.log("Warning: No result.ast.");

      if (errors.length > 0) {
        console.error(errors.join('\n\n'));
      }

      if (errors.length > 0 ||
            ( options.failOnWarnings &&
              ( result.warnings.length > 0 && hasImportantWarning(result.warnings,parserOptions) )
            )
         ) {
        process.exit(1);
      }
    });
}

function processFile(path, options) {
  fs.readFile(path, 'utf8', function (error, data) {
    if (error) {
      console.error('Could not open ' + path);
      process.exit(1); 
    }
    else {
      lint(path, data, options);
    }
  });
}

function processGlob(path, options) {
    glob.readdir(path, function (error, files) {
      if (error) {
        console.error('Unable to read files ' + path);
        process.exit(1); 
      }
      files.forEach(function (path) {
        processFile(path, options);
      });
     });
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
    return header.name === 'Content-Type' && /application\/json/.test(header.value); // header may also contain other info, i.e. encoding:
  });                                                                                 //"application/json; charset=utf-8", so use regexp here.
}

function isValidRequestOrResponse(requestOrResponse) {
  if (isJsonContentType(requestOrResponse.headers)) {
    // check body
    try {
      var body = requestOrResponse.body;
      jsonParser.parse(body);
    } catch (e) {
      return e;
    }
    // schema, if exists, should be a valid json
    try {
      var schema = requestOrResponse.schema;
      if ( schema.length > 0 ) {
        jsonParser.parse(schema);
       }
    } catch (e) {
      return e;
    }
    // also check schema definitions with ajv
    try {
      if ( schema.length > 0 ) {
        schema = JSON.parse(requestOrResponse.schema);
        if ( Object.keys(schema).length > 0 ) {
          var jsconSchemaParser = ajv({verbose:true, allErrors:true, format:'full',v5:true,unicode:true});
          jsconSchemaParser.validateSchema(schema);
          if (jsconSchemaParser.errors !== null ) {
           exceptionMsg = "Error validating schema:\n";
           for (var key in jsconSchemaParser.errors) {
             exceptionMsg = exceptionMsg + '\tValue rasing validation error:\t\t\t"' + jsconSchemaParser.errors[key].data + '".\n';
             exceptionMsg = exceptionMsg + '\tPath within schema:\t\t\t\t"' + jsconSchemaParser.errors[key].dataPath + '".\n';
             exceptionMsg = exceptionMsg + "\tProbably " + jsconSchemaParser.errors[key].message + ': "' +
                            jsconSchemaParser.errors[key].schema + '"' + '.\n\n';
           }
           throw new Error(exceptionMsg);
          }
         } else console.log("schema.length < 0");
      }
    } catch (e) {
      return e;
    }
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

module.exports = function (fileName, validateRequests, validateResponses, failOnWarnings, requireBlueprintName ) {
  
   var options = {
     validateRequests: validateRequests,
     validateResponses: validateResponses,
     failOnWarnings: failOnWarnings,
     requireBlueprintName: requireBlueprintName
   };

  if (isGlob(fileName)) {
    // never require the blueprint name for multiple files
    options.requireBlueprintName = false;
    processGlob(fileName, options);
  }
  else {
    processFile(fileName, options);
  }

};
