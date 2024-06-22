"use strict";
const jsonUtil = require("../resources/JsonUtil");
const icons = require("./ui/icons");
const filterConfig = require("../resources/FilterConfig");
const tempDirectory = require("temp-dir");
const templateCache = require("../shared/templateCache");
const fs = require("fs");
const path = require("path");
const open = require("open");
const ColorHash = require("color-hash");
const { yamlParse, yamlDump } = require("yaml-cfn");
const AWSIcon = require("aws-icons-directory");

const colorHash = new ColorHash();
let nodes = [];
let edges = [];
let nested = [];
let types = new Set();
let useJson;

function reset() {
  nodes = [];
  edges = [];
  nested = [];
  types = new Set();
}

function makeGraph(template, prefix, doReset, renderAll) {
  if (doReset) {
    reset();
  }
  jsonUtil.createPseudoResources(template);

  const resources = Object.keys(template.Resources);
  try {
    for (const resource of resources) {
      const resObj = template.Resources[resource];
      const type = resObj.Type;
      types.add(type);
      if (resObj.Template) {
        nested.push(resource);
        makeGraph(resObj.Template, resource, false, renderAll);
      }
      const dependencies = getDependencies(template, resource);
      addnodes(
        resource,
        dependencies,
        type,
        template.Resources[resource],
        prefix,
        renderAll
      );
    }

    for (const sourceVertex of nodes) {
      for (const dependencyNode of sourceVertex.dependencies) {
        for (const dependency of dependencyNode.value) {
          const targets = nodes.filter(
            (p) => p.id === prefix + "." + dependency.split(".").pop()
          );
          const targetVertex = targets[0];
          if (!targetVertex) {
            continue;
          }
          let from = sourceVertex.id;
          let to = targetVertex.id;
          addEdges(from, to, dependencyNode, sourceVertex);
        }
      }
    }
  } catch (err) {
    console.log(err);
  } finally {
  }
  return { nodes, edges };
}

function addEdges(from, to, dependencyNode, fromNode) {
  if (from && to) {
    if (dependencyNode.path.indexOf("Properties.Events") > 0) {
      edges.push({
        to: from,
        from: to,
        label: "Invoke",
      });
    } else {
      const descriptor = jsonUtil.pathToDescriptor(
        dependencyNode.path,
        filterConfig
      );
      if (
        edges.filter(
          (p) => p.from === from && p.to === to && p.label === descriptor
        ).length
      ) {
        return;
      }

      edges.push({
        from,
        to,
        label: descriptor,
        color: {
          //color: colorHash.hex(descriptor),
          color: "#697078",
          opacity: 0.5
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1,
            type: "image",
            //imageWidth: 24,
            //imageHeight: 24,
            //src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20.088" height="20.087" viewBox="0 0 20.088 20.087"><path d="M10.044,0A10.044,10.044,0,1,0,20.088,10.043,10.043,10.043,0,0,0,10.044,0Zm.047,15.033a4.99,4.99,0,1,1,4.99-4.99A4.989,4.989,0,0,1,10.091,15.033Z"/></svg>'
            //src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABQUlEQVR4nN2VTUoDQRCFPxIyGxMPYryDegGJIrmCGPyJHiIEj2GMnsco/kQ9hMSF2WSk4A00Oj09PSGbPCgYqKpX3dX1amDdkQBd4A54Bb5l9j2Wz2Iq4RD4BNKAfQAHMcQ14NoheADOgS1gQ9YGLoCJEzdUbhAZ+Q9wHEgy34lisyLBtmTkOxG33nWKdHxBidNzO3ksesp9Bxp5AV2n56V6+Qd14FEcR+TgXs4zqqMvjts855ucNi1V0RaH6eQfZnI2lyjQEsdsVQU2xfG1qhZtF7VoLKcptCquxHFTNKaTJcb0qWhMEy2uVPKPxalypz6hoa2YrQqTf1nsAXNgAeyHgodOkZ6u7kNdJ58rZ1DmNDWnSCr59yWipsym5dLp+ULkUW/X0eIK/XCmZdriQ0MTYbvlRWI0ewZG8nkfdD3wC2O8b6rsmdEoAAAAAElFTkSuQmCC"
            // src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABKklEQVR4nN2UYWrCQBCFPyzmehVtlfiriZdQb2DtMUrAeBHpBWqxPURr/ysLEximu+4mpf3hgwdhM/NmebMzcO3IgAlQAXvgW7iXs7HEdMII+ABOEb4DwzbCN8BTgvDJcA30UgpY8U9gA8yBB+ECqOWfjn1MsUUn7IACyAMsJEbnDELimfHcJU4viDecmiKHUOMnxpZLN88NS2PXva9ApQI2LcRzYa3yn30F3lTAvEOBhcp3c/IDRxXQxp5cNbzJP/5FgdL08P8tqlRA3aHANtbk8S+e6Qz4Uvl3vgKZLK4ug/ZiBq1PAEPPqigjN9fijrdEsPYsuxpYim2FfG+NLY4rEtCTrdh2Xa9S13WDgfgZEz6k2BJCXxaXe3avMoyO7tududcSbOh14AxaJNPPRsfs5QAAAABJRU5ErkJggg=="
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABiUlEQVR4nN1U3U7CYAxdNPp6EnUavUJM8Osu1m83th83u0Z8DEMCvojxBcCgD4F4j+kmo8DYX7yiSZOFdeeUc9p63kGHH8engHxtLA3B8tQg/0gmz5aGD/bxSmoagZuQLgD5CywvS/IT0J1X79r3jwH5uQLwUqdBGsRxfFRKsA1ukOeAPAqs4wCpLQkRO0AeJ+82iZ7KZdHglt4g4rsA+SYv5V1So0nQtYoMzTSXD01It/vAVyk1msQgzXKNl2nZkKWg82Anex1jaS0Xsr8rTzqKq4JRdXBO5bI8Xn9PL7sESB9KHq5NELFTXkzz/sEiKwjryMOZ4arBRTFBLf0580ERzAslSmf+/yUaKpPHtQmQXgtNlsPVdEwhcveA/K0UuMxfNDlczRbtXS9at9s98fJCruL2qQiw1ynqXIOn3dNZLrgye7BFMpclCkLXk/FNRlieRXMly1/3fa8s5OTKVWxwrvuVzrWSqyV6VgCelcqyL8QsOVwydoA0kWVMFhJpIr/JtOw19GDiF4GtmCV8ud05AAAAAElFTkSuQmCC"
          },
          from: {
            enabled: true,
            scaleFactor: 1,
            type: "image",
            src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAACXBIWXMAAAsTAAALEwEAmpwYAAABiUlEQVR4nN1U3U7CYAxdNPp6EnUavUJM8Osu1m83th83u0Z8DEMCvojxBcCgD4F4j+kmo8DYX7yiSZOFdeeUc9p63kGHH8engHxtLA3B8tQg/0gmz5aGD/bxSmoagZuQLgD5CywvS/IT0J1X79r3jwH5uQLwUqdBGsRxfFRKsA1ukOeAPAqs4wCpLQkRO0AeJ+82iZ7KZdHglt4g4rsA+SYv5V1So0nQtYoMzTSXD01It/vAVyk1msQgzXKNl2nZkKWg82Anex1jaS0Xsr8rTzqKq4JRdXBO5bI8Xn9PL7sESB9KHq5NELFTXkzz/sEiKwjryMOZ4arBRTFBLf0580ERzAslSmf+/yUaKpPHtQmQXgtNlsPVdEwhcveA/K0UuMxfNDlczRbtXS9at9s98fJCruL2qQiw1ynqXIOn3dNZLrgye7BFMpclCkLXk/FNRlieRXMly1/3fa8s5OTKVWxwrvuVzrWSqyV6VgCelcqyL8QsOVwydoA0kWVMFhJpIr/JtOw19GDiF4GtmCV8ud05AAAAAElFTkSuQmCC"
          },
        },
        smooth: {
          //type: "cubicBezier",
          roundness: 1
        },
        width: 3,
        arrowStrikethrough: false
      });
    }
  }
}

function addnodes(
  resource,
  dependencies,
  type,
  resourceObject,
  prefix,
  renderAll
) {
  delete resourceObject.Template;
  if (nodes.filter((p) => p.id === resource).length === 0) {
    nodes.push({
      id: `${prefix}.${resource}`,
      dependencies: dependencies,
      prefix: prefix,
      hidden: prefix != "root" && !renderAll,
      type: type,
      label: resource,
      //label: resource.length > 10 ? resource.slice(0, 10) + '..' : resource,
      //shape: "image",
      image: createImage(type),
      shape: "box",
      //shape: "custom",
      title: `${
        useJson
          ? JSON.stringify(resourceObject, null, 2)
          : yamlDump(resourceObject).replace(/>/g, "").replace(/</g, "")
      }`,
      resource: resourceObject,
      font: {
        size: 24
      },
      margin: {
        top: 20,
        right: 55,
        bottom: 20
      },
      color: {
        background: "#D2E5FF",
        border: "#2B7CE9"
      },
      shape: "custom",
    })
  }
}

function createImage(resourceType) {
  const resType = resourceType.startsWith("External") ? resourceType.match(/^.+\((.+)\)/)[1] : resourceType
  var svg =
    AWSIcon.getSVG(resType) ||
    '<svg version="1.0" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"    width="100px" height="100px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve"><g>   <rect x="15" y="15" fill="#FF9900" width="70" height="70"/>   <g>       <path fill="#FFFFFF" d="M39.4,47c0,0.6,0.1,1.1,0.2,1.4c0.1,0.4,0.3,0.7,0.5,1.2c0.1,0.1,0.1,0.3,0.1,0.4c0,0.2-0.1,0.3-0.3,0.5           l-1,0.7c-0.2,0.1-0.3,0.1-0.4,0.1c-0.2,0-0.3-0.1-0.5-0.2c-0.2-0.2-0.4-0.5-0.6-0.8c-0.2-0.3-0.3-0.6-0.5-1           c-1.3,1.5-2.9,2.2-4.8,2.2c-1.4,0-2.4-0.4-3.2-1.2c-0.8-0.8-1.2-1.8-1.2-3.1c0-1.4,0.5-2.5,1.5-3.3c1-0.8,2.3-1.3,4-1.3           c0.5,0,1.1,0,1.7,0.1c0.6,0.1,1.2,0.2,1.9,0.4V42c0-1.2-0.3-2.1-0.8-2.6c-0.5-0.5-1.4-0.8-2.6-0.8c-0.6,0-1.1,0.1-1.7,0.2           c-0.6,0.1-1.2,0.3-1.7,0.6c-0.3,0.1-0.5,0.2-0.6,0.2c-0.1,0-0.2,0-0.3,0c-0.2,0-0.3-0.2-0.3-0.5v-0.8c0-0.3,0-0.5,0.1-0.6           c0.1-0.1,0.2-0.2,0.5-0.3c0.6-0.3,1.2-0.5,2-0.7c0.8-0.2,1.6-0.3,2.5-0.3c1.9,0,3.3,0.4,4.2,1.3c0.9,0.9,1.3,2.2,1.3,4V47z            M32.8,49.5c0.5,0,1.1-0.1,1.7-0.3c0.6-0.2,1.1-0.5,1.5-1c0.3-0.3,0.4-0.6,0.6-1c0.1-0.4,0.2-0.9,0.2-1.4V45           c-0.5-0.1-1-0.2-1.5-0.3c-0.5-0.1-1-0.1-1.5-0.1c-1.1,0-1.9,0.2-2.4,0.7c-0.5,0.4-0.8,1.1-0.8,1.9c0,0.8,0.2,1.3,0.6,1.7           C31.5,49.3,32,49.5,32.8,49.5z M45.8,51.2c-0.3,0-0.5-0.1-0.6-0.2c-0.1-0.1-0.2-0.3-0.3-0.6L41,37.9c-0.1-0.3-0.1-0.5-0.1-0.7           c0-0.3,0.1-0.4,0.4-0.4h1.6c0.3,0,0.5,0.1,0.6,0.2c0.1,0.1,0.2,0.3,0.3,0.6l2.7,10.7l2.5-10.7c0.1-0.3,0.2-0.5,0.3-0.6           c0.1-0.1,0.3-0.2,0.7-0.2h1.3c0.3,0,0.5,0.1,0.7,0.2c0.1,0.1,0.2,0.3,0.3,0.6l2.6,10.9l2.8-10.9c0.1-0.3,0.2-0.5,0.3-0.6           c0.1-0.1,0.3-0.2,0.6-0.2h1.5c0.3,0,0.4,0.1,0.4,0.4c0,0.1,0,0.2,0,0.3c0,0.1-0.1,0.2-0.1,0.4l-3.9,12.5c-0.1,0.3-0.2,0.5-0.3,0.6           c-0.1,0.1-0.3,0.2-0.6,0.2h-1.4c-0.3,0-0.5-0.1-0.7-0.2c-0.1-0.1-0.2-0.3-0.3-0.7L50.7,40l-2.5,10.4c-0.1,0.3-0.2,0.5-0.3,0.7           c-0.1,0.1-0.4,0.2-0.7,0.2H45.8z M66.6,51.7c-0.9,0-1.7-0.1-2.5-0.3c-0.8-0.2-1.4-0.4-1.9-0.7c-0.3-0.2-0.4-0.3-0.5-0.5           c-0.1-0.2-0.1-0.3-0.1-0.5V49c0-0.3,0.1-0.5,0.4-0.5c0.1,0,0.2,0,0.3,0.1c0.1,0,0.2,0.1,0.4,0.2c0.5,0.2,1.1,0.4,1.8,0.6           c0.6,0.1,1.3,0.2,1.9,0.2c1,0,1.8-0.2,2.4-0.5c0.6-0.4,0.8-0.9,0.8-1.5c0-0.5-0.1-0.8-0.4-1.1c-0.3-0.3-0.8-0.6-1.6-0.9l-2.4-0.7           c-1.2-0.4-2.1-0.9-2.6-1.6c-0.5-0.7-0.8-1.5-0.8-2.4c0-0.7,0.1-1.3,0.4-1.8c0.3-0.5,0.7-1,1.2-1.3c0.5-0.4,1-0.6,1.7-0.8           c0.6-0.2,1.3-0.3,2-0.3c0.4,0,0.7,0,1.1,0.1c0.4,0,0.7,0.1,1,0.2c0.3,0.1,0.6,0.2,0.9,0.3c0.3,0.1,0.5,0.2,0.7,0.3           c0.2,0.1,0.4,0.3,0.5,0.4c0.1,0.1,0.1,0.3,0.1,0.5v0.8c0,0.3-0.1,0.5-0.4,0.5c-0.1,0-0.3-0.1-0.6-0.2c-0.9-0.4-2-0.6-3.1-0.6           c-0.9,0-1.6,0.2-2.2,0.5c-0.5,0.3-0.8,0.8-0.8,1.4c0,0.5,0.2,0.8,0.5,1.1c0.3,0.3,0.9,0.6,1.8,0.9l2.3,0.7c1.2,0.4,2,0.9,2.5,1.6           c0.5,0.7,0.8,1.4,0.8,2.3c0,0.7-0.1,1.3-0.4,1.9c-0.3,0.6-0.7,1-1.2,1.4c-0.5,0.4-1.1,0.7-1.8,0.9C68.2,51.6,67.5,51.7,66.6,51.7z           "/>       <g>           <path fill-rule="evenodd" clip-rule="evenodd" fill="#FFFFFF" d="M69.7,59.5c-5.3,3.9-13.1,6-19.7,6c-9.3,0-17.8-3.5-24.1-9.2               c-0.5-0.5-0.1-1.1,0.5-0.7c6.9,4,15.4,6.4,24.1,6.4c5.9,0,12.4-1.2,18.4-3.8C69.8,57.9,70.6,58.9,69.7,59.5z"/>           <path fill-rule="evenodd" clip-rule="evenodd" fill="#FFFFFF" d="M71.9,57c-0.7-0.9-4.5-0.4-6.2-0.2c-0.5,0.1-0.6-0.4-0.1-0.7               c3.1-2.1,8.1-1.5,8.6-0.8c0.6,0.7-0.2,5.7-3,8.1c-0.4,0.4-0.9,0.2-0.7-0.3C71.2,61.5,72.6,57.9,71.9,57z"/>       </g>   </g></g></svg>';
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function getDependencies(template, resource) {
  const dependencies = [];
  jsonUtil.findAllValues(template.Resources[resource], dependencies, "Ref");
  jsonUtil.findAllValues(template.Resources[resource], dependencies, "Fn::Sub");
  jsonUtil.findAllValues(
    template.Resources[resource],
    dependencies,
    "Fn::GetAtt"
  );
  jsonUtil.findAllValues(
    template.Resources[resource],
    dependencies,
    "Fn::ImportValue"
  );

  for (const dependency of dependencies) {
    dependency.value = dependency.value.filter((p) => {
      const split = p.split(".");
      if (split.length === 2 && templateCache.templates[split[0]]) {
        return templateCache.templates[split[0]].Resources[split[1]];
      }
      return template.Resources[p];
    });
  }
  return dependencies;
}

async function renderTemplate(
  template,
  isJson,
  filePath,
  ciMode,
  reset,
  standaloneIndex,
  renderAll
) {
  useJson = isJson;
  const { nodes, edges } = makeGraph(template, "root", reset, renderAll);
  const fileContent = `
  var renderAll = ${renderAll}
  var nodes = new vis.DataSet(${JSON.stringify(nodes)});
  var edges = new vis.DataSet(${JSON.stringify(edges)});
  var nested = ${JSON.stringify(nested.sort())};
  var types = ${JSON.stringify(Array.from(types).sort())};
  //var showSidebar = ${!ciMode};
  var showSidebar = false;
  `;
  const uiPath = filePath || path.join(tempDirectory, "cfn-diagram");
  if (!fs.existsSync(uiPath)) {
    fs.mkdirSync(uiPath);
  }
  if (standaloneIndex) {
    fs.readFile(path.join(__dirname, "ui", "index_standalone.template"), 'utf8', function (err, data) {
      if (err) {
        return console.log(err);
      }
      var result = data.replace(/%DATA_JS%/g, fileContent);

      fs.writeFile(path.join(uiPath, "index.html"), result, 'utf8', function (err) {
        if (err) return console.log(err);
      });
  });
  }
  else
  {
  fs.copyFileSync(
    path.join(__dirname, "ui", "index.html"),
    path.join(uiPath, "index.html")
  );
  fs.copyFileSync(
    path.join(__dirname, "ui", "icons.js"),
    path.join(uiPath, "icons.js")
  );
  fs.writeFileSync(path.join(uiPath, "data.js"), fileContent);
  }
  if (!ciMode) {
    open(path.join(uiPath, "index.html"));
  }
}

module.exports = {
  renderTemplate,
  reset,
  makeGraph
};
