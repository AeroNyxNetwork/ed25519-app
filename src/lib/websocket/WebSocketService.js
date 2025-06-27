/**
 * Base WebSocket Service for AeroNyx Platform
 * 
 * File Path: src/lib/websocket/WebSocketService.js
 * 
 * Fixed to handle connected event properly.
 * 
 * @version 3.0.0
 * @author AeroNyx Development Team
 */

import EventEmitter from 'events';

export default class WebSocketService extends EventEmitter {
  constructor(url, options = {}) {
    super();
    
    this.url = url;
    this.options = {
      reconnect: true,
      maxReconnectAttempts: 5,
      reconnectInterval: 1000,
      ...options
    };
    
    this.ws = null;
    this.state = 'CLOSED';
    this.authenticated = false;
    this.reconnectAttempts = 0;
    
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      connectionAttempts: 0
    };
  }

  async connect() {
    if (this.state === 'OPEN' || this.state === 'CONNECTING') {
      return;
    }

    this.state = 'CONNECTING';
    this.metrics.connectionAttempts++;
    
    try {
      await this._createConnection();
    } catch (error) {
      this.log('error', 'Connection failed', error);
      this._handleConnectionError(error);
    }
  }

  disconnect() {
    this.options.reconnect = false;
    
    if (this.ws && this.state === 'OPEN') {
      this.state = 'CLOSING';
      this.ws.close(1000, 'Client disconnect');
    } else {
      this.state = 'CLOSED';
    }
  }

  async send(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid message data');
    }

    if (this.state !== 'OPEN' || !this.ws) {
      throw new Error('WebSocket not connected');
    }

    try {
      const message = JSON.stringify(data);
      this.ws.send(message);
      this.metrics.messagesSent++;
      this.log('debug', 'Message sent:', data.type);
    } catch (error) {
      this.log('error', 'Failed to send message', error);
      throw error;
    }
  }

  async _createConnection() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
          this.state = 'OPEN';
          this.reconnectAttempts = 0;
          
          this.log('info', 'WebSocket connected');
          this.emit('connected');
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          this._handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.log('error', 'WebSocket error', error);
          this.emit('error', error);
        };

        this.ws.onclose = (event) => {
          this._handleClose(event);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.metrics.messagesReceived++;
      
      this.log('debug', 'Message received:', data.type);
      
      // Emit specific event type
      if (data.type) {
        this.emit(data.type, data);
      }
      
      // Always emit raw message
      this.emit('message', data);
      
    } catch (error) {
      this.log('error', 'Failed to parse message', error);
    }
  }

  _handleClose(event) {
    this.state = 'CLOSED';
    this.authenticated = false;
    
    this.log('info', `WebSocket closed: ${event.code}`);
    this.emit('disconnected', event);
    
    if (this.options.reconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this._scheduleReconnect();
    }
  }

  _handleConnectionError(error) {
    this.state = 'CLOSED';
    this.emit('connection_error', error);
    
    if (this.options.reconnect) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    this.state = 'RECONNECTING';
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
      30000
    );
    
    this.log('info', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.state === 'RECONNECTING') {
        this.connect();
      }
    }, delay);
  }

  getMetrics() {
    return {
      ...this.metrics,
      state: this.state,
      authenticated: this.authenticated
    };
  }

  log(level, message, data = null) {
    if (!this.options.debug && level === 'debug') return;
    
    const logMessage = `[WebSocketService] ${message}`;
    
    switch (level) {
      case 'debug':
        console.debug(logMessage, data);
        break;
      case 'info':
        console.info(logMessage, data);
        break;
      case 'warn':
        console.warn(logMessage, data);
        break;
      case 'error':
        console.error(logMessage, data);
        break;
    }
  }
}
