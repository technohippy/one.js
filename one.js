// http://webos-goodies.jp/archives/getting_started_with_webgl.html
var ONE = {};

ONE.Scene = function() {
  this.lights = [];
  this.meshes = [];
};

ONE.Scene.prototype.add = function(obj) {
  if (obj.type == 'light') {
    this.lights.push(obj);
  }
  else if (obj.type == 'mesh') {
    this.meshes.push(obj);
  }
};

ONE.PerspectiveCamera = function(fov, aspect, near, far) {
  this.fov = fov;
  this.aspect = aspect;
  this.near = near;
  this.far = far;
  this.position = new ONE.Position();
  this.angle = 0;
};

ONE.PerspectiveCamera.prototype.rotateOnYAxis = function(angle) {
  this.angle = angle;
};
ONE.PerspectiveCamera.prototype.rotate = ONE.PerspectiveCamera.prototype.rotateOnYAxis;

ONE.PerspectiveCamera.prototype.setPerspective = function(matrix) {
  if (!matrix) matrix = new CanvasMatrix4();
  matrix.translate(this.position.x, this.position.y, this.position.z);
  matrix.rotate(this.angle, 0, 1, 0);
  matrix.perspective(this.fov, this.aspect, this.near, this.far);
  return matrix;
};

ONE.WebGLRenderer = function() {
  this.domElement = null;
  this.gl = null;
  this.program = null;
  this.ibuffer = null;
  this.vbuffers = null;
  this.numIndices = 0;
  this.uniformVars = null;
};

ONE.WebGLRenderer.VSHADER_SOURCE =
  "#ifdef GL_ES\n" +
  "precision highp float;\n" +
  "#endif\n" +
  "\n" +
  "uniform mat4 mvpMatrix;\n" +
  "uniform mat4 normalMatrix;\n" +
  "uniform vec4 lightVec;\n" +
  "uniform vec4 lightColor;\n" +
  "uniform vec4 materialColor;\n" +
  "\n" +
  "attribute vec3 position;\n" +
  "attribute vec3 normal;\n" +
  "attribute vec2 uv;\n" +
  "\n" +
  "varying vec4 color;\n" +
  "varying vec2 texCoord;\n" +
  "\n" +
  "void main() {\n" +
  "  float light = clamp(dot(vec3(0.0, 0.0, 1.0), lightVec.xyz), 0.0, 1.0) * 0.8 + 0.2;\n" +
  "  color       = min(min(materialColor, lightColor), vec4(light, light, light, 1.0));\n" +
  "  texCoord    = uv;\n" +
  "  gl_Position = mvpMatrix * vec4(position, 1.0);\n" +
  "}";

ONE.WebGLRenderer.FSHADER_SOURCE =
  "#ifdef GL_ES\n" +
  "precision highp float;\n" +
  "#endif\n" +
  "\n" +
  "uniform sampler2D texture;\n" +
  "\n" +
  "varying vec4 color;\n" +
  "varying vec2 texCoord;\n" +
  "\n" +
  "void main() {\n" +
  "  //gl_FragColor = texture2D(texture, texCoord) * color;\n" +
  "  gl_FragColor = color;\n" +
  "}";

ONE.WebGLRenderer.prototype.setSize = function(width, height) {
  this.domElement = document.createElement('canvas');
  this.domElement.width = width;
  this.domElement.height = height;
  this.gl = this.domElement.getContext('webgl') || 
    this.domElement.getContext('experimental-webgl');
  if (!this.gl) throw 'WebGL is not supported.';
};

ONE.WebGLRenderer.prototype.render = function(scene, camera) {
  for (var i = 0; i < scene.meshes.length; i++) {
    var geometry = scene.meshes[i].geometry;
    geometry.build(camera.position.z / 500.0);
    this._initVertices(geometry);
    this._initIndices(geometry);
    this._initTexture();
    this._initShaders();
  }

  this.gl.clearColor(0, 0, 0, 1);
  this.gl.clearDepth(camera.far);
  this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

  this.gl.enable(this.gl.DEPTH_TEST);
  this.gl.useProgram(this.program);

  var lightVec  = [0.0, 0.0, 0.0, 0.0];
  var lightColor = ONE.Utils.getRGB(0);
  if (scene.lights && 0 < scene.lights.length) {
    var light = scene.lights[0];
    lightVec = [light.position.x, light.position.y, -light.position.z, 0.0];
    lightColor = light.getColor();
  }

  var modelMatrix = new CanvasMatrix4();

  var mvpMatrix = new CanvasMatrix4(modelMatrix);
  camera.setPerspective(mvpMatrix);

  var normalMatrix = new CanvasMatrix4(modelMatrix);
  normalMatrix.invert();
  normalMatrix.transpose();

  var materialColor = scene.meshes[0].material.getColor();

  var values = [mvpMatrix, normalMatrix, lightVec, lightColor, materialColor];
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    if (value instanceof CanvasMatrix4) {
      this.gl.uniformMatrix4fv(this.uniformVars[i], false, value.getAsWebGLFloatArray());
    }
    else {
      this.gl.uniform4fv(this.uniformVars[i], new Float32Array(value));
    }
  }

  var strides = [3, 3, 2];
  for (var i = 0; i < strides.length; i++) {
    var stride = strides[i];
    this.gl.enableVertexAttribArray(i);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbuffers[i]);
    this.gl.vertexAttribPointer(i, stride, this.gl.FLOAT, false, 0, 0);
  }

  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibuffer);

  /*
  this.gl.enable(this.gl.TEXTURE_2D);
  this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
  this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
  */

  this.gl.drawElements(this.gl.TRIANGLES, this.numIndices, this.gl.UNSIGNED_SHORT, 0);
  this.gl.flush();
};

ONE.WebGLRenderer.prototype._initVertices = function(mesh) {
  this.vbuffers = [mesh.positions, mesh.positions, mesh.uvs];
  for (var i = 0; i < this.vbuffers.length; i++) {
    var data = this.vbuffers[i];
    var vbuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vbuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(data), this.gl.STATIC_DRAW);
    this.vbuffers[i] = vbuffer;
  }
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
};

ONE.WebGLRenderer.prototype._initIndices = function(mesh) {
  this.ibuffer = this.gl.createBuffer();
  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibuffer);
  this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Int16Array(mesh.indices), this.gl.STATIC_DRAW);
  this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

  this.numIndices = mesh.indices.length;
};

ONE.WebGLRenderer.prototype._initTexture = function() {
  // TODO
};

ONE.WebGLRenderer.prototype._initShaders = function() {
  var vshader = this.gl.createShader(this.gl.VERTEX_SHADER);
  this.gl.shaderSource(vshader, ONE.WebGLRenderer.VSHADER_SOURCE);
  this.gl.compileShader(vshader);
  if (!this.gl.getShaderParameter(vshader, this.gl.COMPILE_STATUS)) {
    throw this.gl.getShaderInfoLog(vshader);
  }

  var fshader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
  this.gl.shaderSource(fshader, ONE.WebGLRenderer.FSHADER_SOURCE);
  this.gl.compileShader(fshader);
  if (!this.gl.getShaderParameter(fshader, this.gl.COMPILE_STATUS)) {
    throw this.gl.getShaderInfoLog(fshader);
  }

  this.program = this.gl.createProgram();
  this.gl.attachShader(this.program, vshader);
  this.gl.attachShader(this.program, fshader);

  this.gl.bindAttribLocation(this.program, 0, 'position');
  this.gl.bindAttribLocation(this.program, 1, 'normal');
  this.gl.bindAttribLocation(this.program, 2, 'uv');

  this.gl.linkProgram(this.program);
  if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
    throw this.gl.getProgramInfoLog(this.program);
  }

  this.uniformVars =[
    this.gl.getUniformLocation(this.program, 'mvpMatrix'),
    this.gl.getUniformLocation(this.program, 'normalMatrix'),
    this.gl.getUniformLocation(this.program, 'lightVec'),
    this.gl.getUniformLocation(this.program, 'lightColor'),
    this.gl.getUniformLocation(this.program, 'materialColor')
  ];
};

ONE.DirectionalLight = function(color) {
  this.type = 'light';
  this.color = color;
  this.position = new ONE.Position();
};

ONE.DirectionalLight.prototype.getColor = function() {
  return ONE.Utils.getRGB(this.color);
};

ONE.MeshBasicMaterial = function(props) {
  this.props = props || {};
};

ONE.MeshBasicMaterial.prototype.getColor = function() {
  return ONE.Utils.getRGB(this.props.color || 0xffffff);
};

ONE.LineGeometry = function(length) {
  this.length = length;
  this.positions = null;
  this.uvs = null;
  this.indices = null;
};

ONE.LineGeometry.prototype.build = function(scale) {
  this.positions = [
    -this.length/2.0, scale/2.0, 0.0,
    this.length/2.0, scale/2.0, 0.0,
    -this.length/2.0, -scale/2.0, 0.0,
    this.length/2.0, -scale/2.0, 0.0
  ];
  this.uvs = [
    0.0,0.0, 1.0,0.0, 0.0,1.0,
    0.0,1.0, 1.0,0.0, 1.0,1.0
  ];
  this.indices = [
    0, 1, 2,
    2, 1, 3
  ];
};

ONE.Mesh = function(geometry, material) {
  this.type = 'mesh';
  this.geometry = geometry;
  this.material = material;
};

ONE.Position = function(x, z) {
  this.y = 0.0;
  this.set(x, z);
};

ONE.Position.prototype.set = function(x, z) {
  this.x = x || 0.0;
  this.z = -Math.abs(z || 0.0);
};

ONE.Utils = {
  getRGB: function(color, defaultValue) {
    var r = (color >> 16) / 0xff;
    var g = ((color & 0x00ff00) >> 8) / 0xff;
    var b = (color & 0x0000ff) / 0xff;
    return [r, g, b, 1.0];
  }
};
