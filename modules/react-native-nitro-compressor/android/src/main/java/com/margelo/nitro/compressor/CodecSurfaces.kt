package com.margelo.nitro.compressor

import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLExt
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

internal class CodecInputSurface(private val surface: Surface) : AutoCloseable {
  private val display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
  private val context: android.opengl.EGLContext
  private val eglSurface: android.opengl.EGLSurface

  init {
    check(display != EGL14.EGL_NO_DISPLAY) { "Unable to acquire EGL display" }
    val version = IntArray(2)
    check(EGL14.eglInitialize(display, version, 0, version, 1)) { "Unable to initialize EGL" }
    val attributes = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_ALPHA_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL_RECORDABLE_ANDROID, 1,
      EGL14.EGL_NONE,
    )
    val configs = arrayOfNulls<android.opengl.EGLConfig>(1)
    val count = IntArray(1)
    check(EGL14.eglChooseConfig(display, attributes, 0, configs, 0, 1, count, 0)) {
      "Unable to choose EGL config"
    }
    context = EGL14.eglCreateContext(
      display,
      requireNotNull(configs[0]),
      EGL14.EGL_NO_CONTEXT,
      intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE),
      0,
    )
    check(context != EGL14.EGL_NO_CONTEXT) { "Unable to create EGL context" }
    eglSurface = EGL14.eglCreateWindowSurface(
      display,
      requireNotNull(configs[0]),
      surface,
      intArrayOf(EGL14.EGL_NONE),
      0,
    )
    check(eglSurface != EGL14.EGL_NO_SURFACE) { "Unable to create EGL window surface" }
  }

  fun makeCurrent() {
    check(EGL14.eglMakeCurrent(display, eglSurface, eglSurface, context)) {
      "Unable to make EGL context current"
    }
  }

  fun setPresentationTime(nanoseconds: Long) {
    EGLExt.eglPresentationTimeANDROID(display, eglSurface, nanoseconds)
  }

  fun swapBuffers(): Boolean = EGL14.eglSwapBuffers(display, eglSurface)

  override fun close() {
    EGL14.eglMakeCurrent(
      display,
      EGL14.EGL_NO_SURFACE,
      EGL14.EGL_NO_SURFACE,
      EGL14.EGL_NO_CONTEXT,
    )
    EGL14.eglDestroySurface(display, eglSurface)
    EGL14.eglDestroyContext(display, context)
    EGL14.eglReleaseThread()
    EGL14.eglTerminate(display)
    surface.release()
  }

  companion object {
    private const val EGL_RECORDABLE_ANDROID = 0x3142
  }
}

internal class CodecOutputSurface : SurfaceTexture.OnFrameAvailableListener, AutoCloseable {
  private val frameSync = Object()
  private var frameAvailable = false
  private val renderer = ExternalTextureRenderer()
  private val texture = SurfaceTexture(renderer.textureId)
  val surface = Surface(texture)

  init {
    texture.setOnFrameAvailableListener(this)
  }

  override fun onFrameAvailable(surfaceTexture: SurfaceTexture?) {
    synchronized(frameSync) {
      frameAvailable = true
      frameSync.notifyAll()
    }
  }

  fun awaitAndDraw(width: Int, height: Int) {
    synchronized(frameSync) {
      while (!frameAvailable) {
        frameSync.wait(FRAME_TIMEOUT_MS)
        check(frameAvailable) { "Timed out waiting for decoded video frame" }
      }
      frameAvailable = false
    }
    texture.updateTexImage()
    renderer.draw(texture, width, height)
  }

  override fun close() {
    surface.release()
    texture.release()
    renderer.close()
  }

  companion object {
    private const val FRAME_TIMEOUT_MS = 5_000L
  }
}

private class ExternalTextureRenderer : AutoCloseable {
  private val vertexBuffer: FloatBuffer = ByteBuffer
    .allocateDirect(VERTICES.size * 4)
    .order(ByteOrder.nativeOrder())
    .asFloatBuffer()
    .apply { put(VERTICES).position(0) }
  private val program: Int
  val textureId: Int

  init {
    program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    textureId = textures[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MIN_FILTER,
      GLES20.GL_LINEAR,
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_MAG_FILTER,
      GLES20.GL_LINEAR,
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_WRAP_S,
      GLES20.GL_CLAMP_TO_EDGE,
    )
    GLES20.glTexParameteri(
      GLES11Ext.GL_TEXTURE_EXTERNAL_OES,
      GLES20.GL_TEXTURE_WRAP_T,
      GLES20.GL_CLAMP_TO_EDGE,
    )
  }

  fun draw(texture: SurfaceTexture, width: Int, height: Int) {
    val transform = FloatArray(16)
    texture.getTransformMatrix(transform)
    GLES20.glViewport(0, 0, width, height)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    GLES20.glUseProgram(program)
    vertexBuffer.position(0)
    val position = GLES20.glGetAttribLocation(program, "aPosition")
    GLES20.glEnableVertexAttribArray(position)
    GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer)
    vertexBuffer.position(2)
    val textureCoordinate = GLES20.glGetAttribLocation(program, "aTextureCoordinate")
    GLES20.glEnableVertexAttribArray(textureCoordinate)
    GLES20.glVertexAttribPointer(textureCoordinate, 2, GLES20.GL_FLOAT, false, 16, vertexBuffer)
    GLES20.glUniformMatrix4fv(
      GLES20.glGetUniformLocation(program, "uTextureTransform"),
      1,
      false,
      transform,
      0,
    )
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glFinish()
  }

  override fun close() {
    GLES20.glDeleteTextures(1, intArrayOf(textureId), 0)
    GLES20.glDeleteProgram(program)
  }

  private fun createProgram(vertex: String, fragment: String): Int {
    fun compile(type: Int, source: String): Int {
      val shader = GLES20.glCreateShader(type)
      GLES20.glShaderSource(shader, source)
      GLES20.glCompileShader(shader)
      val status = IntArray(1)
      GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
      check(status[0] == GLES20.GL_TRUE) { GLES20.glGetShaderInfoLog(shader) }
      return shader
    }
    val vertexShader = compile(GLES20.GL_VERTEX_SHADER, vertex)
    val fragmentShader = compile(GLES20.GL_FRAGMENT_SHADER, fragment)
    return GLES20.glCreateProgram().also { value ->
      GLES20.glAttachShader(value, vertexShader)
      GLES20.glAttachShader(value, fragmentShader)
      GLES20.glLinkProgram(value)
      val status = IntArray(1)
      GLES20.glGetProgramiv(value, GLES20.GL_LINK_STATUS, status, 0)
      check(status[0] == GLES20.GL_TRUE) { GLES20.glGetProgramInfoLog(value) }
      GLES20.glDeleteShader(vertexShader)
      GLES20.glDeleteShader(fragmentShader)
    }
  }

  companion object {
    private val VERTICES = floatArrayOf(
      -1f, -1f, 0f, 0f,
      1f, -1f, 1f, 0f,
      -1f, 1f, 0f, 1f,
      1f, 1f, 1f, 1f,
    )
    private const val VERTEX_SHADER = """
      attribute vec4 aPosition;
      attribute vec4 aTextureCoordinate;
      uniform mat4 uTextureTransform;
      varying vec2 vTextureCoordinate;
      void main() {
        gl_Position = aPosition;
        vTextureCoordinate = (uTextureTransform * aTextureCoordinate).xy;
      }
    """
    private const val FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 vTextureCoordinate;
      uniform samplerExternalOES sTexture;
      void main() {
        gl_FragColor = texture2D(sTexture, vTextureCoordinate);
      }
    """
  }
}
