'use strict';

var syncMove = require('@mapbox/mapbox-gl-sync-move');
var EventEmitter = require('events').EventEmitter;
var glcompareangle = 0;

/**
 * @param {Object} a The first Mapbox GL Map
 * @param {Object} b The second Mapbox GL Map
 * @param {string|HTMLElement} container An HTML Element, or an element selector string for the compare container. It should be a wrapper around the two map Elements.
 * @param {Object} options
 * @param {string} [options.orientation=vertical] The orientation of the compare slider. `vertical` creates a vertical slider bar to compare one map on the left (map A) with another map on the right (map B). `horizontal` creates a horizontal slider bar to compare on mop on the top (map A) and another map on the bottom (map B).
 * @param {boolean} [options.mousemove=false] If `true` the compare slider will move with the cursor, otherwise the slider will need to be dragged to move.
 * @example
 * var compare = new mapboxgl.Compare(beforeMap, afterMap, '#wrapper', {
 *   orientation: 'vertical',
 *   mousemove: true
 * });
 * @see [Swipe between maps](https://www.mapbox.com/mapbox-gl-js/example/mapbox-gl-compare/)
 */
function Compare(a, b, container, options) {
  this.options = options ? options : {};
  this._mapA = a;
  this._mapB = b;
  this._horizontal = this.options.orientation === 'horizontal';
  this._onDown = this._onDown.bind(this);
  this._onMove = this._onMove.bind(this);
  this._onMouseUp = this._onMouseUp.bind(this);
  this._onTouchEnd = this._onTouchEnd.bind(this);
  this._ev = new EventEmitter();
  this._swiper = document.createElement('div');
  this._swiper.className = this._horizontal ? 'compare-swiper-horizontal' : 'compare-swiper-vertical';

  this._controlContainer = document.createElement('div');
  this._controlContainer.className = this._horizontal ? 'mapboxgl-compare mapboxgl-compare-horizontal' : 'mapboxgl-compare';
  this._controlContainer.className = this._controlContainer.className;
  this._controlContainer.appendChild(this._swiper);

  if (typeof container === 'string' && document.body.querySelectorAll) {
    // get container with a selector
    var appendTarget = document.body.querySelectorAll(container)[0];
    if (!appendTarget) {
      throw new Error('Cannot find element with specified container selector.')
    }
    appendTarget.appendChild(this._controlContainer)
  } else if (container instanceof Element && container.appendChild) {
    // get container directly
    container.appendChild(this._controlContainer)
  } else {
    throw new Error('Invalid container specified. Must be CSS selector or HTML element.')
  }

  this._bounds = b.getContainer().getBoundingClientRect();
  var swiperPosition = (this._horizontal ? this._bounds.height : this._bounds.width) / 2;
  this._setPosition(swiperPosition);

  this._clearSync = syncMove(a, b);
  this._onResize = function() {
    this._bounds = b.getContainer().getBoundingClientRect();
    if (this.currentPosition) this._setPosition(this.currentPosition);
  }.bind(this);

  b.on('resize', this._onResize);

  if (this.options && this.options.mousemove) {
    a.getContainer().addEventListener('mousemove', this._onMove);
    b.getContainer().addEventListener('mousemove', this._onMove);
  }

  this._swiper.addEventListener('mousedown', this._onDown);
  this._swiper.addEventListener('touchstart', this._onDown);
}

Compare.prototype = {
  _setPointerEvents: function(v) {
    this._controlContainer.style.pointerEvents = v;
    this._swiper.style.pointerEvents = v;
  },

  _onDown: function(e) {
    if (e.touches) {
      document.addEventListener('touchmove', this._onMove);
      document.addEventListener('touchend', this._onTouchEnd);
    } else {
      document.addEventListener('mousemove', this._onMove);
      document.addEventListener('mouseup', this._onMouseUp);
    }
  },

  _setPosition: function(x) {
    x = Math.min(x, this._horizontal
      ? this._bounds.height
      : this._bounds.width);
    var pos = this._horizontal
      ? 'translate(0, ' + x + 'px)'
      : 'translate(' + x + 'px, 0)';
    this._controlContainer.style.transform = pos;
    this._controlContainer.style.WebkitTransform = pos;
    var clipA = this._horizontal
      ? 'rect(0, 999em, ' + x + 'px, 0)'
      : 'rect(0, ' + x + 'px, ' + this._bounds.height + 'px, 0)';
    var clipB = this._horizontal
      ? 'rect(' + x + 'px, 999em, ' + this._bounds.height + 'px,0)'
      : 'rect(0, 999em, ' + this._bounds.height + 'px,' + x + 'px)';
    
    this._mapA.getContainer().style.clipPath = clipA;
    this._mapB.getContainer().style.clipPath = clipB;
    this.currentPosition = x;
  },

  _setPosRot: function(x, y, a) {
    //console.log('setPosRot', x, y, a);
    if (a === undefined) {
      a = Math.PI/2;
    }

    x = Math.min(x, this._horizontal
      ? this._bounds.height
      : this._bounds.width);
    var pos = this._horizontal
      ? 'translate(0, ' + x + 'px)'
      : 'translate(' + x + 'px, 0)';
    this._controlContainer.style.transform = pos;
    this._controlContainer.style.WebkitTransform = pos;



    const [poly1, poly2] = splitScreenIntoPolygons(this._bounds.width, this._bounds.height, x, y, a);

    var clipA = 'polygon(' +poly1[0].x + 'px ' + poly1[0].y + 'px ';
    for (let pt of poly1.slice(1)) {
      clipA += ", " + pt.x + 'px ' + pt.y + 'px';
    }
    clipA += ')';

    var clipB = 'polygon(' +poly2[0].x + 'px ' + poly2[0].y + 'px ';
    for (let pt of poly2.slice(1)) {
      clipB += ", " + pt.x + 'px ' + pt.y + 'px';
    }
    clipB += ')';

    //console.log('clipA', clipA);
    //console.log('clipB', clipB);

    this._mapA.getContainer().style.clipPath = clipA;
    this._mapB.getContainer().style.clipPath = clipB;
    this.currentPosition = x;
  },


  _onMove: function(e) {
    if (this.options && this.options.mousemove) {
      this._setPointerEvents(e.touches ? 'auto' : 'none');
    }

    /*this._horizontal
      ? this._setPosRot(this._getX(e)/2, this._getY(e), 0)
      : this._setPosRot(this._getX(e), this._getY(e)/2, 0);
      */
      this._setPosRot(this._getX(e), this._getY(e), Math.PI/2);
  },

  _onMouseUp: function() {
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    this.fire('slideend', { currentPosition: this.currentPosition });
  },

  _onTouchEnd: function() {
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onTouchEnd);
    this.fire('slideend', { currentPosition: this.currentPosition });
  },

  _getX: function(e) {
    e = e.touches ? e.touches[0] : e;
    var x = e.clientX - this._bounds.left;
    if (x < 0) x = 0;
    if (x > this._bounds.width) x = this._bounds.width;
    return x;
  },

  _getY: function(e) {
    e = e.touches ? e.touches[0] : e;
    var y = e.clientY - this._bounds.top;
    if (y < 0) y = 0;
    if (y > this._bounds.height) y = this._bounds.height;
    return y;
  },

  /**
   * Set the position of the slider.
   *
   * @param {number} x Slider position in pixels from left/top.
   */
  setSlider: function(x) {
    this._setPosition(x);
  },

    /**
   * Set the position of the slider.
   *
   * @param {number} x Slider position in pixels from left/top.
   */
  setSliderPosRot: function(x, y, a) {
    if (a === undefined) {
      a = Math.PI/2;
    }
    glcompareangle = a;
    this._setPosRot(x, y, a);
  },

  getSliderRot: function() {
    return glcompareangle;
  },

  /**
   * Adds a listener for events of a specified type.
   *
   * @param {string} type The event type to listen for; one of `slideend`.
   * @param {Function} listener The function to be called when the event is fired.
   * @returns {Compare} `this`
   */
  on: function(type, fn) {
    this._ev.on(type, fn);
    return this;
  },

  /**
   * Fire an event of a specified type.
   *
   * @param {string} type The event type to fire; one of `slideend`.
   * @param {Object} data Data passed to the event listener.
   * @returns {Compare} `this`
   */
  fire: function(type, data) {
    this._ev.emit(type, data);
    return this;
  },

  /**
   * Removes an event listener previously added with `Compare#on`.
   *
   * @param {string} type The event type previously used to install the listener.
   * @param {Function} listener The function previously installed as a listener.
   * @returns {Compare} `this`
   */
  off: function(type, fn) {
    this._ev.removeListener(type, fn);
    return this;
  },

  remove: function() {
    this._clearSync();
    this._mapB.off('resize', this._onResize);
    var aContainer = this._mapA.getContainer();

    if (!!aContainer) {
      aContainer.style.clip = null;
      aContainer.removeEventListener('mousemove', this._onMove);
    }

    var bContainer = this._mapB.getContainer();

    if (!!bContainer) {
      bContainer.style.clip = null;
      bContainer.removeEventListener('mousemove', this._onMove);
    }

    this._swiper.removeEventListener('mousedown', this._onDown);
    this._swiper.removeEventListener('touchstart', this._onDown);
    this._controlContainer.remove();
  }


};

if (window.mapboxgl) {
  mapboxgl.Compare = Compare;
} else if (typeof module !== 'undefined') {
  module.exports = Compare;
}

function splitScreenIntoPolygons(width, height, x, y, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  const corners = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height }
  ];

  const edges = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[3]],
      [corners[3], corners[0]]
  ];

  const intersectionPoints = [];

  function lineIntersection(p1, p2) {
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-10) return null;

      const t = ((p1.x - x) * ey - (p1.y - y) * ex) / denom;
      const s = ((p1.x - x) * dy - (p1.y - y) * dx) / denom;

      if (s >= 0 && s <= 1) {
          return { x: x + t * dx, y: y + t * dy };
      }
      return null;
  }

  for (const [p1, p2] of edges) {
      const ip = lineIntersection(p1, p2);
      if (ip) {
          const isDuplicate = intersectionPoints.some(p => Math.hypot(p.x - ip.x, p.y - ip.y) < 1e-6);
          if (!isDuplicate) intersectionPoints.push(ip);
      }
  }

  if (intersectionPoints.length !== 2) {
      throw new Error("Line must intersect the screen in exactly 2 points");
  }

  const [i1, i2] = intersectionPoints;

  function isLeft(p) {
      return (dx * (p.y - y) - dy * (p.x - x)) > 0;
  }

  const poly1 = [], poly2 = [];

  poly1.push(i1);
  poly2.push(i1);

  for (let i = 0; i < corners.length; i++) {
      const curr = corners[i];
      const next = corners[(i + 1) % 4];

      const side = isLeft(curr);
      if (side) {
          poly1.push(curr);
      } else {
          poly2.push(curr);
      }

      const onEdge =
          Math.min(curr.x, next.x) - 1e-6 <= i2.x && i2.x <= Math.max(curr.x, next.x) + 1e-6 &&
          Math.min(curr.y, next.y) - 1e-6 <= i2.y && i2.y <= Math.max(curr.y, next.y) + 1e-6;

      if (onEdge) {
          poly1.push(i2);
          poly2.push(i2);
      }
  }

  function sortClockwise(points) {
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      return points.slice().sort((a, b) => {
          const angleA = Math.atan2(a.y - cy, a.x - cx);
          const angleB = Math.atan2(b.y - cy, b.x - cx);
          return angleA - angleB;
      });
  }

  return [sortClockwise(poly1), sortClockwise(poly2)];
}

