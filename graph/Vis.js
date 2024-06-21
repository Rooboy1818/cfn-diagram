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
          color: "grey"
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1,
            type: "image",
            //src: "http://localhost:3030/assets/logo.svg"
            //src: "../images/arrow-circle.svg"
            src: 'data:image/svg+xml,<svg width="25px" height="25px" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8" stroke="#000000" stroke-width="2"/></svg>'
            //src2: '<svg width="24px" height="24px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">     <!-- Generator: Sketch 64 (93537) - https://sketch.com -->     <title>Icon-Architecture/16/Arch_Amazon-API-Gateway_16</title>     <desc>Created with Sketch.</desc>     <defs>         <linearGradient x1="0%" y1="100%" x2="100%" y2="0%" id="linearGradient-1">             <stop stop-color="#A166FF" offset="0%"></stop>             <stop stop-color="#AAA" offset="100%"></stop>         </linearGradient>     </defs>     <g id="Icon-Architecture/16/Arch_Amazon-API-Gateway_16" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">         <g id="Icon-Architecture-BG/16/Networking-Content-Delivery" fill="url(#linearGradient-1)">             <rect id="Rectangle" x="0" y="0" width="24" height="24"></rect>         </g>         <path d="M6,6.76751613 L8,5.43446738 L8,18.5659476 L6,17.2328988 L6,6.76751613 Z M5,6.49950633 L5,17.4999086 C5,17.6669147 5.084,17.8239204 5.223,17.9159238 L8.223,19.9159969 C8.307,19.971999 8.403,20 8.5,20 C8.581,20 8.662,19.9809993 8.736,19.9409978 C8.898,19.8539947 9,19.6849885 9,19.4999817 L9,16.9998903 L10,16.9998903 L10,15.9998537 L9,15.9998537 L9,7.99956118 L10,7.99956118 L10,6.99952461 L9,6.99952461 L9,4.49943319 C9,4.31542646 8.898,4.14542025 8.736,4.0594171 C8.574,3.97241392 8.377,3.98141425 8.223,4.08341798 L5.223,6.08349112 C5.084,6.17649452 5,6.33250022 5,6.49950633 L5,6.49950633 Z M19,17.2328988 L17,18.5659476 L17,5.43446738 L19,6.76751613 L19,17.2328988 Z M19.777,6.08349112 L16.777,4.08341798 C16.623,3.98141425 16.426,3.97241392 16.264,4.0594171 C16.102,4.14542025 16,4.31542646 16,4.49943319 L16,6.99952461 L15,6.99952461 L15,7.99956118 L16,7.99956118 L16,15.9998537 L15,15.9998537 L15,16.9998903 L16,16.9998903 L16,19.4999817 C16,19.6849885 16.102,19.8539947 16.264,19.9409978 C16.338,19.9809993 16.419,20 16.5,20 C16.597,20 16.693,19.971999 16.777,19.9159969 L19.777,17.9159238 C19.916,17.8239204 20,17.6669147 20,17.4999086 L20,6.49950633 C20,6.33250022 19.916,6.17649452 19.777,6.08349112 L19.777,6.08349112 Z M13,7.99956118 L14,7.99956118 L14,6.99952461 L13,6.99952461 L13,7.99956118 Z M11,7.99956118 L12,7.99956118 L12,6.99952461 L11,6.99952461 L11,7.99956118 Z M13,16.9998903 L14,16.9998903 L14,15.9998537 L13,15.9998537 L13,16.9998903 Z M11,16.9998903 L12,16.9998903 L12,15.9998537 L11,15.9998537 L11,16.9998903 Z M13.18,14.884813 L10.18,12.3847215 C10.065,12.288718 10,12.1487129 10,11.9997075 C10,11.851702 10.065,11.7106969 10.18,11.6156934 L13.18,9.11560199 L13.82,9.88463011 L11.281,11.9997075 L13.82,14.1157848 L13.18,14.884813 Z" id="Amazon-API-Gateway_Icon_16_Squid" fill="#FFFFFF"></path>     </g> </svg>'
            //src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' style='width:24px;height:24px' viewBox='0 0 24 24'%3E%3Cpath fill='%23000000' d='M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H9.18C9.6,1.84 10.7,1 12,1C13.3,1 14.4,1.84 14.82,3H19M12,8L7,13H10V17H14V13H17L12,8M12,3A1,1 0 0,0 11,4A1,1 0 0,0 12,5A1,1 0 0,0 13,4A1,1 0 0,0 12,3Z' /%3E%3C/svg%3E",
          },
          /*from: {
            enabled: true,
            scaleFactor: 1,
            type: "image",
            src: "http://localhost:3030/assets/logo.svg"
          },*/
        },
        //smooth: {
        //  type: "cubicBezier",
        //  roundness: 1
        //}
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
      //label: resource,
      label: resource.length > 10 ? resource.slice(0, 10) + '..' : resource,
      //shape: "image",
      image: createImage(type),
      shape: "box",
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
        right: 60,
        bottom: 20
      },
      color: {
        background: "#D2E5FF",
        border: "#2B7CE9"
      }
    });
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
