import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private socket: Socket;

  constructor() {
    this.socket = io('http://172.16.4.11:3000'); // Change if backend is hosted elsewhere

    // Check socket connection
    this.socket.on('connect', () => {
      console.log('Socket connected: ', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }

  // Register user event
  registerUser(username: string) {
    this.socket.emit('register-user', username);
  }

  // Send message to another user
  sendMessage(from: string, to: string, message: string) {
    this.socket.emit('send-message', { from, to, message });
  }

  // Send typing indicator
  sendTyping(from: string, to: string) {
    this.socket.emit('typing', { from, to });
  }

  // Listen for received messages
  onMessageReceived(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('message-received', (msg) => observer.next(msg));
    });
  }

  // Get contacts from the server
  async getContacts(username: string): Promise<string[]> {
    try {
      const res = await fetch('/get-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      return data.contacts || [];
    } catch (error) {
      console.error('Error fetching contacts:', error);
      return [];
    }
  }

  // Get messages with a specific chat partner
  async getMessages(username: string, chatPartner: string): Promise<any[]> {
    try {
      const res = await fetch('/get-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, chatPartner })
      });
      const data = await res.json();
      return data.messages || [];
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
    }
  }

  // Add a new contact
  addContact(currentUser: string, newContact: string): Observable<any> {
    return new Observable(observer => {
      this.socket.emit('add-contact', { currentUser, newContact });

      // Listen for response from server after adding contact
      this.socket.on('contact-added', (response) => {
        if (response.success) {
          observer.next(response);
        } else {
          observer.error(response.message); // Handle failure
        }
      });
    });
  }
}
