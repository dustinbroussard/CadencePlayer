export class MIDIFile {
  constructor() {
    this.notes = [];
  }

  addNote(track, note, startTime, endTime) {
    this.notes.push({ track, note, startTime, endTime });
  }

  export() {
    return JSON.stringify(this.notes);
  }
}
