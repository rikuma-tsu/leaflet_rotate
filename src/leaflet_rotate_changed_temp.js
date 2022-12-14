(function (factory) {
    typeof define === 'function' && define.amd ? define(factory) :
    factory();
}((function () { 'use strict';

    /**
     * L.DomUtil
     */
    const domUtilProto = L.extend({}, L.DomUtil);

    L.extend(L.DomUtil, {

        setTransform: function(el, offset, scale, bearing, pivot) {
            var pos = offset || new L.Point(0, 0);

            if (!bearing) {
                offset = pos._round();
                return domUtilProto.setTransform.call(this, el, offset, scale);
            }

            pos = pos.rotateFrom(bearing, pivot);

            el.style[L.DomUtil.TRANSFORM] =
                'translate3d(' + pos.x + 'px,' + pos.y + 'px' + ',0)' +
                (scale ? ' scale(' + scale + ')' : '') +
                ' rotate(' + bearing + 'rad)';
        },

        setPosition: function(el, point, bearing, pivot) { // (HTMLElement, Point[, Boolean])
            if (!bearing) {
                return domUtilProto.setPosition.call(this, el, point);
            }
            el._leaflet_pos = point;
            if (L.Browser.any3d) {
                L.DomUtil.setTransform(el, point, undefined, bearing, pivot);
            } else {
                el.style.left = point.x + 'px';
                el.style.top = point.y + 'px';
            }
        },

        // Constants for rotation
        DEG_TO_RAD: Math.PI / 180,
        RAD_TO_DEG: 180 / Math.PI,

    });

    /**
     * L.Map
     */
    const mapProto = L.extend({}, L.Map.prototype);

    L.Map.mergeOptions({ rotate: false, bearing: 0, });

    L.Map.include({

        initialize: function(id, options) { // (HTMLElement or String, Object)
            if (options.rotate) {
                this._rotate = true;
                this._bearing = 0;
            }
            mapProto.initialize.call(this, id, options);
            if(this.options.rotate){
            this.setBearing(this.options.bearing);
            }
        },
        // Rotation methods
        // setBearing will work with just the 'theta' parameter.
        setBearing: function(theta) {
            if (!L.Browser.any3d || !this._rotate) { return; }

            var rotatePanePos = this._getRotatePanePos();
            var halfSize = this.getSize().divideBy(2);
            this._pivot = this._getMapPanePos().clone().multiplyBy(-1).add(halfSize);

            rotatePanePos = rotatePanePos.rotateFrom(-this._bearing, this._pivot);

            this._bearing = theta * L.DomUtil.DEG_TO_RAD; // TODO: mod 360
            this._rotatePanePos = rotatePanePos.rotateFrom(this._bearing, this._pivot);
            L.DomUtil.setPosition(this._rotatePane, rotatePanePos, this._bearing, this._pivot);

            this.fire('rotate');
        },

        getBearing: function() {
            return this._bearing * L.DomUtil.RAD_TO_DEG;
        },

        _getRotatePanePos: function() {
            return this._rotatePanePos || new L.Point(0, 0);
        },

        containerPointToLayerPoint: function(point) { // (Point)
            if (!this._rotate) {
                return mapProto.containerPointToLayerPoint.call(this, point);
            }
            return L.point(point)
                .subtract(this._getMapPanePos())
                .rotateFrom(-this._bearing, this._getRotatePanePos())
                .subtract(this._getRotatePanePos());
        },

        _getNewPixelOrigin: function(center, zoom) {
            var viewHalf = this.getSize()._divideBy(2);
            if (!this._rotate) {
                mapProto._getNewPixelOrigin.call(this, center, zoom);
            }
            return this.project(center, zoom)
                .rotate(this._bearing)
                ._subtract(viewHalf)
                ._add(this._getMapPanePos())
                ._add(this._getRotatePanePos())
                .rotate(-this._bearing)
                ._round();
        },

        _initPanes: function() {
            var panes = this._panes = {};
            this._paneRenderers = {};

            // @section
            //
            // Panes are DOM elements used to control the ordering of layers on the map. You
            // can access panes with [`map.getPane`](#map-getpane) or
            // [`map.getPanes`](#map-getpanes) methods. New panes can be created with the
            // [`map.createPane`](#map-createpane) method.
            //
            // Every map has the following default panes that differ only in zIndex.
            //
            // @pane mapPane: HTMLElement = 'auto'
            // Pane that contains all other map panes

            this._mapPane = this.createPane('mapPane', this._container);
            L.DomUtil.setPosition(this._mapPane, new L.Point(0, 0));

            if (this._rotate) {
                this._rotatePane = this.createPane('rotatePane', this._mapPane);
                this._norotatePane = this.createPane('norotatePane', this._mapPane);

                // @pane tilePane: HTMLElement = 2
                // Pane for tile layers
                this.createPane('tilePane', this._rotatePane);
                // @pane overlayPane: HTMLElement = 4
                // Pane for overlays like polylines and polygons
                this.createPane('overlayPane', this._rotatePane);

                // @pane shadowPane: HTMLElement = 5
                // Pane for overlay shadows (e.g. marker shadows)
                this.createPane('shadowPane', this._norotatePane);
                // @pane markerPane: HTMLElement = 6
                // Pane for marker icons
                this.createPane('markerPane', this._norotatePane);
                // @pane tooltipPane: HTMLElement = 650
                // Pane for tooltips.
                this.createPane('tooltipPane', this._norotatePane);
                // @pane popupPane: HTMLElement = 700
                // Pane for popups.
                this.createPane('popupPane', this._norotatePane);
            } else {
                // @pane tilePane: HTMLElement = 2
                // Pane for tile layers
                this.createPane('tilePane');
                // @pane overlayPane: HTMLElement = 4
                // Pane for overlays like polylines and polygons
                this.createPane('overlayPane');
                // @pane shadowPane: HTMLElement = 5
                // Pane for overlay shadows (e.g. marker shadows)
                this.createPane('shadowPane');
                // @pane markerPane: HTMLElement = 6
                // Pane for marker icons
                this.createPane('markerPane');
                // @pane tooltipPane: HTMLElement = 650
                // Pane for tooltips.
                this.createPane('tooltipPane');
                // @pane popupPane: HTMLElement = 700
                // Pane for popups.
                this.createPane('popupPane');
            }

            if (!this.options.markerZoomAnimation) {
                L.DomUtil.addClass(panes.markerPane, 'leaflet-zoom-hide');
                L.DomUtil.addClass(panes.shadowPane, 'leaflet-zoom-hide');
            }
        },

    });

    /**
     * L.Point
     */
    L.extend(L.Point.prototype, {

        // Rotate around (0,0) by applying the 2D rotation matrix:
        // ??? x' ??? = ??? cos ??  -sin ?? ??? ??? x ???
        // ??? y' ???   ??? sin ??   cos ?? ??? ??? y ???
        // Theta must be given in radians.
        rotate: function(theta) {
            if (!theta) { return this; }
            var sinTheta = Math.sin(theta);
            var cosTheta = Math.cos(theta);

            return new L.Point(
                this.x * cosTheta - this.y * sinTheta,
                this.x * sinTheta + this.y * cosTheta
            );
        },

        // Rotate around (pivot.x, pivot.y) by:
        // 1. subtract (pivot.x, pivot.y)
        // 2. rotate around (0, 0)
        // 3. add (pivot.x, pivot.y) back
        // same as `this.subtract(pivot).rotate(theta).add(pivot)`
        rotateFrom: function(theta, pivot) {
            if (!theta) { return this; }
            var sinTheta = Math.sin(theta);
            var cosTheta = Math.cos(theta);
            var cx = pivot.x,
                cy = pivot.y;
            var x = this.x - cx,
                y = this.y - cy;

            return new L.Point(
                x * cosTheta - y * sinTheta + cx,
                x * sinTheta + y * cosTheta + cy
            );
        },
    });

    /*
     * L.Handler.ShiftKeyRotate is used by L.Map to add shift-wheel rotation.
     */

    // @namespace Map
    // @section Interaction Options
    L.Map.mergeOptions({

        // @section ShiftKey interaction options
        // @option shiftKeyRotate: Boolean|String = *
        // Whether the map can be rotated with a shit-wheel rotation
        shiftKeyRotate: true,

    });

    L.Map.ShiftKeyRotate = L.Handler.extend({

        addHooks: function() {
            L.DomEvent.on(this._map._container, "wheel", this._handleShiftScroll, this);
            // this._map.shiftKeyRotate.enable();
            this._map.shiftKeyRotate.rotate = true;
        },

        removeHooks: function() {
            L.DomEvent.off(this._map._container, "wheel", this._handleShiftScroll, this);
            this._map.shiftKeyRotate.rotate = false;
        },

        _handleShiftScroll: function(e) {
            if (e.shiftKey) {
                e.preventDefault();
                this._map.scrollWheelZoom.disable();
                this._map.setBearing((this._map._bearing * L.DomUtil.RAD_TO_DEG) + Math.sign(e.deltaY) * 5);
            } else {
                this._map.scrollWheelZoom.enable();
            }
        },

    });

    // @section Handlers
    // @property touchZoom: Handler
    // Touch rotate handler.
    L.Map.addInitHook('addHandler', 'shiftKeyRotate', L.Map.ShiftKeyRotate);

    // decrease "scrollWheelZoom" handler priority over "shiftKeyRotate" handler
    L.Map.addInitHook(function() {
        if (this.scrollWheelZoom.enabled() && this.shiftKeyRotate.enabled()) {
            this.scrollWheelZoom.disable();
            this.scrollWheelZoom.enable();
        }
    });

    /**
     * L.GridLayer
     */
     const gridLayerProto = L.extend({}, L.GridLayer.prototype);

     L.GridLayer.include({
 
         getEvents: function() {
             var events = gridLayerProto.getEvents.call(this);
             if (this._map._rotate && !this.options.updateWhenIdle) {
                 if (!this._onRotate) {
                     this._onRotate = L.Util.throttle(this._onMoveEnd, this.options.updateInterval, this);
                 }
                 events.rotate = this._onRotate;
             }
             return events;
         },
 
         _getTiledPixelBounds: function(center) {
             if (!this._map._rotate) {
                 return gridLayerProto._getTiledPixelBounds.call(this, center);
             }
             var map = this._map,
                 mapZoom = map._animatingZoom ? Math.max(map._animateToZoom, map.getZoom()) : map.getZoom(),
                 scale = map.getZoomScale(mapZoom, this._tileZoom),
                 pixelCenter = map.project(center, this._tileZoom).floor(),
                 size = map.getSize(),
                 halfSize = new L.Bounds([
                     map.containerPointToLayerPoint([0, 0]).floor(),
                     map.containerPointToLayerPoint([size.x, 0]).floor(),
                     map.containerPointToLayerPoint([0, size.y]).floor(),
                     map.containerPointToLayerPoint([size.x, size.y]).floor()
                 ]).getSize().divideBy(scale * 2);
 
             return new L.Bounds(pixelCenter.subtract(halfSize), pixelCenter.add(halfSize));
         },
 
     });
                
    L.Map.TouchGestures = L.Handler.extend({

        initialize: function(map) {
            this._map = map;
            this.rotate = !!this._map.options.touchRotate;
            this.zoom = !!this._map.options.touchZoom;
        },

        addHooks: function() {
            L.DomEvent.on(this._map._container, 'touchstart', this._onTouchStart, this);
        },

        removeHooks: function() {
            L.DomEvent.off(this._map._container, 'touchstart', this._onTouchStart, this);
        },

        _onTouchStart: function(e) {
            var map = this._map;

            if (!e.touches || e.touches.length !== 2 || map._animatingZoom || this._zooming || this._rotating) { return; }

            var p1 = map.mouseEventToContainerPoint(e.touches[0]),
                p2 = map.mouseEventToContainerPoint(e.touches[1]),
                vector = p1.subtract(p2);

            this._centerPoint = map.getSize()._divideBy(2);
            this._startLatLng = map.containerPointToLatLng(this._centerPoint);

            if (this.zoom) {
                if (map.options.touchZoom !== 'center') {
                    this._pinchStartLatLng = map.containerPointToLatLng(p1.add(p2)._divideBy(2));
                }
                this._startDist = p1.distanceTo(p2);
                this._startZoom = map.getZoom();
                this._zooming = true;
            } else {
                this._zooming = false;
            }

            if (this.rotate) {
                this._startTheta = Math.atan(vector.x / vector.y);
                this._startBearing = map.getBearing();
                if (vector.y < 0) { this._startBearing += 180; }
                this._rotating = true;
            } else {
                this._rotating = false;
            }

            this._moved = false;

            map.stop();

            L.DomEvent
                .on(document, 'touchmove', this._onTouchMove, this)
                .on(document, 'touchend', this._onTouchEnd, this);

            L.DomEvent.preventDefault(e);
        },

        _onTouchMove: function(e) {
            if (!e.touches || e.touches.length !== 2 || !(this._zooming || this._rotating)) { return; }

            var map = this._map,
                p1 = map.mouseEventToContainerPoint(e.touches[0]),
                p2 = map.mouseEventToContainerPoint(e.touches[1]),
                vector = p1.subtract(p2),
                scale = p1.distanceTo(p2) / this._startDist,
                delta;

            if (this._rotating) {
                var theta = Math.atan(vector.x / vector.y);
                var bearingDelta = (theta - this._startTheta) * L.DomUtil.RAD_TO_DEG;
                if (vector.y < 0) { bearingDelta += 180; }
                if (bearingDelta) {
                    /// TODO: The pivot should be the last touch point, but zoomAnimation manages to
                    ///   overwrite the rotate pane position. Maybe related to #3529.
                    map.setBearing(this._startBearing - bearingDelta);
                }
            }

            if (this._zooming) {
                this._zoom = map.getScaleZoom(scale, this._startZoom);

                if (!map.options.bounceAtZoomLimits && (
                        (this._zoom < map.getMinZoom() && scale < 1) ||
                        (this._zoom > map.getMaxZoom() && scale > 1))) {
                    this._zoom = map._limitZoom(this._zoom);
                }

                if (map.options.touchZoom === 'center') {
                    this._center = this._startLatLng;
                    if (scale === 1) { return; }
                } else {
                    // Get delta from pinch to center, so centerLatLng is delta applied to initial pinchLatLng
                    delta = p1._add(p2)._divideBy(2)._subtract(this._centerPoint);
                    if (scale === 1 && delta.x === 0 && delta.y === 0) { return; }

                    var alpha = -map.getBearing() * L.DomUtil.DEG_TO_RAD;

                    this._center = map.unproject(map.project(this._pinchStartLatLng).subtract(delta.rotate(alpha)));
                }

            }

            if (!this._moved) {
                map._moveStart(true);
                this._moved = true;
            }

            L.Util.cancelAnimFrame(this._animRequest);

            var moveFn = L.bind(map._move, map, this._center, this._zoom, { pinch: true, round: false });
            this._animRequest = L.Util.requestAnimFrame(moveFn, this, true);

            L.DomEvent.preventDefault(e);
        },

        _onTouchEnd: function() {
            if (!this._moved || !this._zooming) {
                this._zooming = false;
                return;
            }

            this._zooming = false;
            this._rotating = false;
            L.Util.cancelAnimFrame(this._animRequest);

            L.DomEvent
                .off(document, 'touchmove', this._onTouchMove)
                .off(document, 'touchend', this._onTouchEnd);

            if (this.zoom) {
                // Pinch updates GridLayers' levels only when snapZoom is off, so snapZoom becomes noUpdate.
                if (this._map.options.zoomAnimation) {
                    this._map._animateZoom(this._center, this._map._limitZoom(this._zoom), true, this._map.options.snapZoom);
                } else {
                    this._map._resetView(this._center, this._map._limitZoom(this._zoom));
                }
            }
        },

    });

    // @section Handlers
    // @property touchGestures: Handler
    // Touch gestures handler.
    L.Map.addInitHook('addHandler', 'touchGestures', L.Map.TouchGestures);

    /*
     * L.Handler.TouchRotate is used by L.Map to add two-finger rotation gestures.
     */

    // @namespace Map
    // @section Interaction Options
    L.Map.mergeOptions({

        // @section Touch interaction options
        // @option touchRotate: Boolean|String = *
        // Whether the map can be rotated with a two-finger rotation gesture
        touchRotate: false,

    });

    L.Map.TouchRotate = L.Handler.extend({

        addHooks: function() {
            this._map.touchGestures.enable();
            this._map.touchGestures.rotate = true;
        },

        removeHooks: function() {
            this._map.touchGestures.rotate = false;
        },

    });

    // @section Handlers
    // @property touchZoom: Handler
    // Touch rotate handler.
    L.Map.addInitHook('addHandler', 'touchRotate', L.Map.TouchRotate);

    /*
     * L.Handler.ShiftKeyRotate is used by L.Map to add shift-wheel rotation.
     */

    // @namespace Map
    // @section Interaction Options
    L.Map.mergeOptions({

        // @section ShiftKey interaction options
        // @option shiftKeyRotate: Boolean|String = *
        // Whether the map can be rotated with a shit-wheel rotation
        shiftKeyRotate: true,

    });
                
})));
