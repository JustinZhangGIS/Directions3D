/*global define,document */
/*jslint sloppy:true,nomen:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/_base/array",
    "dojo/_base/Color",
    "dojo/colors",
    "dojo/number",
    "dojo/query",
    "dojo/Deferred",
    "dojo/on",
    "dojo/dom",
    "dojo/dom-class",
    "put-selector/put",
    "dijit/registry",
    "esri/core/watchUtils",
    "esri/core/promiseUtils",
    "esri/Map",
    "esri/WebScene",
    "esri/Viewpoint",
    "esri/portal/PortalItem",
    "esri/views/SceneView",
    "esri/Graphic",
    "esri/layers/FeatureLayer",
    "esri/layers/support/LabelClass",
    "esri/symbols/LabelSymbol3D",
    "esri/symbols/TextSymbol3DLayer",
    "esri/symbols/Font",
    "esri/symbols/TextSymbol",
    "esri/layers/support/Field",
    "esri/renderers/SimpleRenderer",
    "esri/renderers/UniqueValueRenderer",
    "esri/symbols/PointSymbol3D",
    "esri/symbols/ObjectSymbol3DLayer",
    "esri/symbols/LineSymbol3D",
    "esri/symbols/PathSymbol3DLayer",
    "esri/geometry/geometryEngine",
    "esri/geometry/Point",
    "esri/geometry/Polyline",
    "esri/geometry/Polygon",
    "esri/tasks/support/FeatureSet",
    "esri/tasks/RouteTask",
    "esri/tasks/support/RouteParameters"
], function (declare, lang, array, Color, colors, number, query, Deferred, on, dom, domClass, put, registry,
             watchUtils, promiseUtils, Map, WebScene, Viewpoint, PortalItem, SceneView,
             Graphic, FeatureLayer, LabelClass, LabelSymbol3D, TextSymbol3DLayer, Font, TextSymbol,
             Field, SimpleRenderer, UniqueValueRenderer, PointSymbol3D, ObjectSymbol3DLayer, LineSymbol3D, PathSymbol3DLayer,
             geometryEngine, Point, Polyline, Polygon, FeatureSet, RouteTask, RouteParameters) {


    /**
     * MAIN APPLICATION
     */
    var MainApp = declare(null, {

        // ROUTE OFFSET IN METERS //
        ROUTE_OFFSET: 5.0,

        // START/STOP LOCATIONS HEIGHTS //
        STOP_HEIGHT: 50.0,

        /**
         * CONSTRUCTOR
         *
         * @param config
         */
        constructor: function (config) {
            declare.safeMixin(this, config);
        },

        /**
         * STARTUP
         */
        startup: function () {
            var itemIdOrItemInfo = (this.webscene || this.webmap || this.itemInfo);
            if(itemIdOrItemInfo) {
                this.initializeMap(itemIdOrItemInfo);
            } else {
                MainApp.displayMessage(new Error("itemInfo, webmap, or webscene parameter not defined"));
            }
        },

        /**
         * INITIALIZE THE MAP
         *
         * @param webSceneItemId
         */
        initializeMap: function (webSceneItemId) {

            // LOADING MAP //
            MainApp.displayMessage("Loading Map...");

            // WEB SCENE //
            var webScene = new WebScene({
                portalItem: new PortalItem({
                    id: webSceneItemId
                })
            });

            /* var portalItem = new PortalItem({
             id: webSceneItemId
             });*/

            // MAIN SCENE VIEW //
            this.sceneView = new SceneView({
                container: "scene-node",
                map: webScene
            });
            this.sceneView.then(function () {
                this._whenFinishedUpdatingOnce(this.sceneView).then(function () {

                    // INITIALIZE ROUTING LAYERS //
                    this.initializeRoutingLayers();

                    // INITIALIZE ROUTING //
                    this.initializeRoutingTask();

                    this.setMapCursor("crosshair");

                    // CLEAR DISPLAY MESSAGE //
                    MainApp.displayMessage();

                }.bind(this), MainApp.displayMessage);
            }.bind(this), MainApp.displayMessage);


            // DIRECTIONS SCENE VIEW //
            this.routeView = new SceneView({
                container: "animation-scene-node",
                map: webScene,
                ui: { components: [] },
                excludeLayerIds: ["stopsLayer", "routeLayer"]
            });
            this.routeView.then(function () {

                this.routeView.on("layerview-create", function (layerViewCreateEvt) {
                    if(array.indexOf(this.routeView.excludeLayerIds, layerViewCreateEvt.layer.id) > -1) {
                        layerViewCreateEvt.layerView.visible = false;
                    }
                }.bind(this));

            }.bind(this), MainApp.displayMessage);

        },

        /**
         *
         * @param view
         * @returns {Promise}
         * @private
         */
        _whenFinishedUpdatingOnce: function (view) {
            return watchUtils.whenTrueOnce(view, "updating").then(function () {
                return watchUtils.whenFalseOnce(view, "updating");
            }.bind(this), console.warn);
        },

        /**
         *
         */
        initializeRoutingLayers: function () {

            // STOPS LAYER //
            this.stopsLayer = new FeatureLayer({
                id: "stopsLayer",
                geometryType: "point",
                objectIdField: "id",
                fields: [
                    new Field({
                        "name": "id",
                        "alias": "id",
                        "type": "oid"
                    }),
                    new Field({
                        "name": "type",
                        "alias": "type",
                        "type": "string"
                    }),
                    new Field({
                        "name": "label",
                        "alias": "label",
                        "type": "string"
                    })
                ],
                source: [],
                hasZ: true,
                labelsVisible: true,
                labelingInfo: [
                    new LabelClass({
                        labelExpressionInfo: {
                            value: "{label}"
                        },
                        labelPlacement: "above-center",
                        symbol: new LabelSymbol3D({
                            symbolLayers: [
                                new TextSymbol3DLayer({
                                    material: { color: Color.named.white },
                                    size: 15,
                                    font: {
                                        style: "normal",
                                        weight: "bold",
                                        family: "Helvetica"
                                    }
                                })
                            ]
                        })
                    })
                ],
                renderer: new UniqueValueRenderer({
                    defaultLabel: "Stops",
                    defaultSymbol: new PointSymbol3D({
                        symbolLayers: [
                            new ObjectSymbol3DLayer({
                                width: 25.0, height: 25.0,
                                resource: {
                                    primitive: "sphere"
                                },
                                material: {
                                    color: Color.named.red
                                }
                            })
                        ]
                    }),
                    field: "type",
                    uniqueValueInfos: [
                        {
                            value: "location",
                            label: "Location",
                            description: "A location along the route",
                            symbol: new PointSymbol3D({
                                symbolLayers: [
                                    new ObjectSymbol3DLayer({
                                        width: 0.5,
                                        height: 50.0,
                                        material: { color: Color.named.white },
                                        resource: { primitive: "cylinder" }
                                    }),
                                    new ObjectSymbol3DLayer({
                                        width: 15.0,
                                        material: { color: "#467fd9" },
                                        resource: { primitive: "sphere" }
                                    })
                                ]
                            })
                        },
                        {
                            value: "start",
                            label: "Start",
                            description: "The route start location",
                            symbol: new PointSymbol3D({
                                symbolLayers: [
                                    new ObjectSymbol3DLayer({
                                        width: 5.0, height: this.STOP_HEIGHT,
                                        resource: {
                                            primitive: "cylinder"
                                        },
                                        material: {
                                            color: Color.named.lime
                                        }
                                    })
                                ]
                            })
                        },
                        {
                            value: "stop",
                            label: "Stop",
                            description: "The route stop location",
                            symbol: new PointSymbol3D({
                                symbolLayers: [
                                    new ObjectSymbol3DLayer({
                                        width: 5.0, height: this.STOP_HEIGHT,
                                        resource: {
                                            primitive: "cylinder"
                                        },
                                        material: {
                                            color: Color.named.red
                                        }
                                    })
                                ]
                            })
                        }
                    ]
                })
            });
            this.sceneView.map.add(this.stopsLayer);

            // ROUTE LAYER //
            this.routeLayer = new FeatureLayer({
                id: "routeLayer",
                geometryType: "polyline",
                objectIdField: "id",
                fields: [
                    new Field({
                        "name": "id",
                        "alias": "id",
                        "type": "oid"
                    })
                ],
                source: [],
                hasZ: true,
                elevationInfo: {
                    mode: "relative-to-ground",
                    offset: this.ROUTE_OFFSET
                },
                opacity: 0.7,
                renderer: new SimpleRenderer({
                    symbol: new LineSymbol3D({
                        symbolLayers: [
                            new PathSymbol3DLayer({
                                size: 5.0,
                                material: {
                                    color: Color.named.gold
                                }
                            })
                        ]
                    })
                })
            });
            this.sceneView.map.add(this.routeLayer);

        },

        /**
         *
         */
        initializeRoutingTask: function () {

            // ROUTE TASK //
            this.routeTask = new RouteTask({ url: "//route.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World" });
            this.routeParams = new RouteParameters({
                stops: new FeatureSet({ features: [] }),
                startTime: new Date(),
                returnDirections: true,
                directionsLengthUnits: "meters",
                returnStops: false,
                returnRoutes: true,
                outputGeometryPrecision: 5,
                outputGeometryPrecisionUnits: "meters",
                outSpatialReference: this.sceneView.spatialReference
            });

            // SET ROUTE STOP ON SCENE TAP //
            this.sceneView.on("click", this.setRouteStop.bind(this));

            // LOOK AHEAD DISTANCE //
            this.lookAheadDistance = 10;

            // ANIMATION SLIDER //
            this.animationSlider = registry.byId("animation-slider");

            this.animationAlongMin = 0.0;
            this.animationAlongMax = 1.0;
            this.animationAlongSteps = 1000;
            this.animationAlongStep = this.animationAlongStepDefault = (this.animationAlongMax / this.animationAlongSteps);

            this.animationSlider.set("minimum", this.animationAlongMin);
            this.animationSlider.set("maximum", this.animationAlongMax);
            this.animationSlider.set("discreteValues", this.animationAlongSteps + 1);
            this.animationSlider.set("value", this.animationAlongMin);

            // ANIMATE //
            this.animationSliderChangeHandle = this.animationSlider.on("change", this.animateAlong.bind(this));

            // SPEED //
            registry.byId("speed-slider").on("change", function (speedFactor) {
                this.animationAlongStep = this.animationAlongStepDefault * speedFactor;
            }.bind(this));

            // OFFSET //
            registry.byId("offset-slider").on("change", function (offsetMeters) {
                this.ROUTE_OFFSET = offsetMeters;
                if(this.routePolyline && (!this.animating)) {
                    this.animateAlong(this.animationSlider.get("value"));
                }
            }.bind(this));

            // ANIMATION BUTTON //
            this.animationButton = registry.byId("animation-button");
            this.animationButton.on("change", function (checked) {
                this.animating = checked;
                if(this.animating) {
                    var animationAlong = this.animationSlider.get("value");
                    if(animationAlong >= this.animationAlongMax) {
                        this.animationSlider.set("value", this.animationAlongMin);
                    }
                    window.requestAnimationFrame(this._animateNext.bind(this));
                }
            }.bind(this));


        },

        /**
         *
         * @private
         */
        _animateNext: function () {

            var animationAlong = this.animationSlider.get("value");
            if(animationAlong < this.animationAlongMax) {
                if(this.animating) {
                    this.animationSlider.set("value", animationAlong + this.animationAlongStep);
                    window.requestAnimationFrame(this._animateNext.bind(this));
                }
            } else {
                this.animationButton.set("checked", false);
            }

        },

        /**
         *
         * @param cursor
         */
        setMapCursor: function (cursor) {
            this.sceneView.container.style.cursor = (cursor || "default");
        },

        /**
         *
         * @param location
         * @param attributes
         */
        addAnimatedStopLocation: function (location, attributes) {
            var deferred = new Deferred();

            this.setMapCursor("wait");

            var localZ = this.sceneView.basemapTerrain.getElevation(location);
            var tempZ = -this.STOP_HEIGHT;

            var updateTemp = function () {
                if(tempZ < 0) {

                    if(this.tempStopGraphic) {
                        this.stopsLayer.source.remove(this.tempStopGraphic);
                    }
                    var tempLocation = new Point({ spatialReference: location.spatialReference, x: location.x, y: location.y, z: localZ + ++tempZ });
                    this.tempStopGraphic = new Graphic(tempLocation, null, attributes);
                    this.stopsLayer.source.add(this.tempStopGraphic);

                    window.requestAnimationFrame(updateTemp);
                } else {
                    this.stopsLayer.source.add(new Graphic(location, null, attributes));
                    this.setMapCursor("crosshair");
                    deferred.resolve();
                }
            }.bind(this);

            window.requestAnimationFrame(updateTemp);

            return deferred.promise;
        },

        /**
         *
         * @param evt
         */
        setRouteStop: function (evt) {

            // RESET ROUTE PARAMS, STOPS, ROUTE, AND DIRECTIONS //
            if(this.routeLayer.source.length > 0) {
                this.stopsLayer.source.removeAll();
                this.routeLayer.source.removeAll();
                this.routeParams.stops.features = [];
                this.displayDirections();
                this.animationButton.set("disabled", true);
                this.animationSlider.set("disabled", true);
            }

            // STOP GRAPHIC //
            var stopLocation = evt.mapPoint;
            var stopGeomNoZ = new Point({ x: stopLocation.x, y: stopLocation.y, spatialReference: stopLocation.spatialReference });
            var stopGraphic = new Graphic(stopGeomNoZ, null, { elevation: stopLocation.z });

            // ADD STOP TO ROUTE PARAMS //
            this.routeParams.stops.features.push(stopGraphic);

            // FIRST STOP //
            if(this.routeParams.stops.features.length === 1) {
                this.addAnimatedStopLocation(stopLocation, { "type": "start", "label": "Start" });
            }

            // SECOND STOP //
            if(this.routeParams.stops.features.length === 2) {
                this.addAnimatedStopLocation(stopLocation, { "type": "stop", "label": "Finish" }).then(function () {

                    MainApp.displayMessage("Getting directions to destination...");

                    // FIND ROUTE //
                    this.routeTask.solve(this.routeParams).then(function (routeResponse) {
                        MainApp.displayMessage("Found route...");

                        // ROUTE RESULT //
                        var routeResult = routeResponse.routeResults[0];

                        // ROUTE GEOMETRY //
                        var routeGeom = new Polyline({
                            hasZ: false,
                            paths: lang.clone(routeResult.route.geometry.paths),
                            spatialReference: routeResult.spatialReference
                        });

                        // ROUTE GRAPHIC //
                        var routeGraphic = new Graphic(routeGeom, null, routeResult.route.attributes);
                        this.routeLayer.source.add(routeGraphic);

                        // DIRECTIONS //
                        this.displayDirections(routeResult);

                        // ASSIGN ELEVATION AS Zs AND DISTANCE ALONG AS Ms //
                        this.routePolyline = this.setZsAndMs(this.sceneView, routeGeom);

                        // ROUTE DISTANCE IN METERS //
                        var lastPathIndex = (this.routePolyline.paths.length - 1);
                        var lastPoint = this.routePolyline.getPoint(lastPathIndex, this.routePolyline.paths[lastPathIndex].length - 1);
                        this.maxRouteDistanceMeters = (lastPoint.m - this.lookAheadDistance);

                        // ENABLE ANIMATION BUTTON AND SLIDER //
                        this.animationButton.set("disabled", false);
                        this.animationSlider.set("disabled", false);

                        // ANIMATE TO ROUTE START //
                        this.animateAlong(this.animationAlongMin);

                        MainApp.displayMessage();
                    }.bind(this), console.warn);
                }.bind(this), console.warn);
            }
        },

        /**
         *
         * @param animationPercentAlong
         */
        animateAlong: function (animationPercentAlong) {

            var distanceAlong = Math.min(this.maxRouteDistanceMeters, (this.maxRouteDistanceMeters * animationPercentAlong));

            var fromLocation = this.findLocationAtDistance(this.routePolyline, distanceAlong);
            var toLocation = this.findLocationAtDistance(this.routePolyline, distanceAlong + this.lookAheadDistance);
            fromLocation.z += this.ROUTE_OFFSET;
            toLocation.z += this.ROUTE_OFFSET;

            if(this.locationGraphic) {
                this.stopsLayer.source.remove(this.locationGraphic);
            }
            this.locationGraphic = new Graphic(fromLocation, null, { "type": "location", "label": lang.replace("{dist} meters along route", { dist: distanceAlong.toFixed(1) }) });
            this.stopsLayer.source.add(this.locationGraphic);

            this.routeView.goTo({
                position: fromLocation,
                target: toLocation
            });

        },


        /**
         *
         * @param polyline
         * @param distanceAlong
         * @returns {Point}
         */
        findLocationAtDistance: function (polyline, distanceAlong) {

            var locationAlong = polyline.getPoint(0, 0);

            array.every(polyline.paths, function (part, partIdx) {
                return array.every(part, function (coords, coordIdx) {
                    var location = polyline.getPoint(partIdx, coordIdx);
                    if(location.m < distanceAlong) {
                        return true;
                    } else {
                        if(coordIdx > 0) {
                            locationAlong = this._interpolateBetween(polyline.getPoint(partIdx, coordIdx - 1), location, distanceAlong);
                        } else {
                            if(partIdx > 0) {
                                var lastPointOfPreviousPart = polyline.getPoint(partIdx - 1, polyline.paths[partIdx - 1].length - 1);
                                locationAlong = this._interpolateBetween(lastPointOfPreviousPart, location, distanceAlong);
                            }
                        }
                        return false;
                    }
                }.bind(this));
            }.bind(this));

            return locationAlong;
        },

        /**
         *
         * @param pointA
         * @param pointB
         * @param measure
         * @returns {*}
         * @private
         */
        _interpolateBetween: function (pointA, pointB, measure) {

            var betweenPercent = 1.0 - (pointB.m - measure) / (pointB.m - pointA.m);

            return new Point({
                spatialReference: pointA.spatialReference,
                x: pointA.x + ((pointB.x - pointA.x) * betweenPercent),
                y: pointA.y + ((pointB.y - pointA.y) * betweenPercent),
                z: pointA.z + ((pointB.z - pointA.z) * betweenPercent),
                m: measure //pointA.m + ((pointB.m - pointA.m) * betweenPercent)
            });
        },

        /**
         *
         * @param view
         * @param geometry
         * @returns {*}
         * @private
         */
        setZsAndMs: function (view, geometry) {

            switch (geometry.type) {
                case "point":
                    var newPoint = geometry.clone();
                    newPoint.hasZ = true;
                    newPoint.z = view.basemapTerrain.getElevation(geometry);
                    return newPoint;
                    break;

                case "polyline":
                    return new Polyline({
                        hasZ: true,
                        hasM: true,
                        paths: this._setZMParts(view, geometry),
                        spatialReference: view.spatialReference
                    });
                    break;

                case "polygon":
                    return new Polygon({
                        hasZ: true,
                        hasM: true,
                        rings: this._setZMParts(view, geometry),
                        spatialReference: view.spatialReference
                    });
                    break;
            }
        },

        /**
         *
         * @param view
         * @param geometry
         * @returns {Number[]}
         */
        _setZMParts: function (view, geometry) {

            var parts = geometry.rings || geometry.paths;
            var distanceAlong = 0.0;

            return array.map(parts, function (part, partIdx) {
                return array.map(part, function (coords, coordIdx) {
                    var location = geometry.getPoint(partIdx, coordIdx);
                    var elevation = view.basemapTerrain.getElevation(location);

                    var prevLocation = geometry.getPoint(partIdx, (coordIdx > 0) ? (coordIdx - 1) : 0);
                    distanceAlong += this._geodesicDistance(view, prevLocation, location);

                    return [coords[0], coords[1], elevation, distanceAlong];
                }.bind(this));
            }.bind(this));

        },

        /**
         *
         * @param view
         * @param fromPoint
         * @param toPoint
         * @returns {Number}
         * @private
         */
        _geodesicDistance: function (view, fromPoint, toPoint) {
            var polyline = new Polyline(view.spatialReference);
            polyline.addPath([fromPoint, toPoint]);
            return geometryEngine.geodesicLength(polyline, "meters");
        },

        /**
         *
         * @param routeResult
         */
        displayDirections: function (routeResult) {

            // DIRECTIONS PANE //
            var directionsPane = dom.byId("directions-node");
            directionsPane.innerHTML = "";

            // DO WE HAVE A ROUTE //
            if(routeResult) {

                // DISPLAY TOTALS //
                var totals = {
                    distance: number.format(routeResult.route.attributes.Total_Kilometers, { places: 2 }),
                    time: number.format(routeResult.route.attributes.Total_TravelTime, { places: 1 })
                };
                put(directionsPane, "div#route-totals", lang.replace("{distance} kilometers | {time} minutes", totals));


                // DIRECTIONS NODE //
                var directionsNode = put(directionsPane, "div.directions-node");

                // DIRECTIONS INFOS //
                this.directionInfos = [];

                // TOTAL DRIVE TIME //
                var totalDriveLengthMeters = routeResult.directions.totalLength;
                var directionDriveLengthMeters = 0.0;
                var directionDriveAlong = 0;

                // DIRECTIONS FEATURES //
                var directionsFeatures = routeResult.directions.features;
                array.forEach(directionsFeatures, function (directionsFeature, directionsIndex) {
                    //console.info(directionsFeature.attributes.maneuverType);

                    var directionsDetails = lang.replace("{length} of {total} meters ({along}%)", {
                        length: directionDriveLengthMeters.toFixed(1),
                        total: totalDriveLengthMeters.toFixed(1),
                        along: (directionDriveAlong * 100.0).toFixed(0)
                    });

                    // DIRECTION NODE //
                    var directionNode = put(directionsNode, "div.direction-node", {
                        id: lang.replace("direction-{0}", [directionsIndex]),
                        title: directionsDetails
                    });

                    // DIRECTION START POSITION //
                    var directionPath = directionsFeature.geometry.paths[0];
                    var startPosition = new Point(directionPath[0], routeResult.spatialReference);
                    startPosition.z = (this.sceneView.basemapTerrain.getElevation(startPosition));

                    // DIRECTION INFO //
                    this.directionInfos[directionsIndex] = {
                        node: directionNode,
                        feature: directionsFeature,
                        startPosition: startPosition,
                        distanceAlong: directionDriveLengthMeters,
                        along: +directionDriveAlong
                    };


                    // DIRECTION DRIVE TIME //
                    directionDriveLengthMeters += directionsFeature.attributes.length;
                    directionDriveAlong = (directionDriveLengthMeters / totalDriveLengthMeters);


                    // DIRECTIONS TABLE //
                    var directionTable = put(directionNode, "table");
                    var topRow = put(directionTable, "tr");
                    put(topRow, lang.replace("td div.maneuverImage.{maneuverType}<", directionsFeature.attributes), { rowSpan: 2 });

                    // DIRECTIONS DETAILS //
                    if((directionsIndex > 0) && (directionsIndex < directionsFeatures.length - 1)) {
                        put(topRow, "td div.direction-details", { innerHTML: lang.replace("{0}. {1}", [directionsIndex, directionsFeature.attributes.text]) });
                    } else {
                        put(topRow, "td div.direction-details", { innerHTML: directionsFeature.attributes.text });
                    }

                    var distanceMeters = directionsFeature.attributes.length;
                    var timeMinutes = directionsFeature.attributes.time;
                    if(timeMinutes > 0.0) {
                        var continueDetails = {
                            distance: (distanceMeters < 1000) ? distanceMeters.toFixed(0) : (distanceMeters / 1000).toFixed(1),
                            distanceUnits: (distanceMeters < 1000) ? "meters" : "kms",
                            time: (timeMinutes > 1) ? " | " + timeMinutes.toFixed(0) : "",
                            timeUnits: (timeMinutes > 1) ? ((timeMinutes > 2) ? "minutes" : "minute") : ""
                        };
                        put(directionTable, "tr td div.direction-other", lang.replace("{distance} {distanceUnits} {time} {timeUnits}", continueDetails));
                    }

                    // DIRECTION NODE CLICK //
                    on(directionNode, "click", function () {

                        // SELECT DIRECTION NODE //
                        this._selectDirectionNode(directionNode);

                        // UPDATE ROUTE VIEW //
                        this.animationSlider.set("value", this.directionInfos[directionsIndex].along);

                    }.bind(this));
                }.bind(this));

            }

        },

        _appendOID: function (attributes, objectIdField) {
            //attributes[objectIdField || "id"] = (new Date()).valueOf();
            return attributes;
        },

        /**
         *
         * @param directionNode
         * @private
         */
        _selectDirectionNode: function (directionNode) {

            query(".direction-node").forEach(function (node) {
                domClass.toggle(node, "direction-selected", directionNode ? (node.id === directionNode.id) : false);
            }.bind(this));

            if(directionNode) {
                directionNode.scrollIntoView();
            }

        }

    });

    /**
     *  DISPLAY MESSAGE OR ERROR
     *
     * @param messageOrError {string | Error}
     * @param smallText {boolean}
     */
    MainApp.displayMessage = function (messageOrError, smallText) {
        require(["dojo/query", "put-selector/put"], function (query, put) {
            query(".message-node").orphan();
            if(messageOrError) {
                if(messageOrError instanceof Error) {
                    put(document.body, "div.message-node.error-node span", messageOrError.message);
                } else {
                    if(messageOrError.declaredClass === "esri.tasks.GPMessage") {
                        var simpleMessage = messageOrError.description;
                        put(document.body, "div.message-node span.esriJobMessage.$ span.small-text $", messageOrError.type, simpleMessage);
                    } else {
                        put(document.body, smallText ? "div.message-node span.small-text" : "div.message-node span", messageOrError);
                    }
                }
            }
        });
    };

    MainApp.version = "0.0.2";

    return MainApp;
});
