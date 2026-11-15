/** Drop one actual durable review reply at the client boundary and count any later submissions. */
export function recoveryReviewReplySocket(Base, origin, loss) {
  return class extends Base {
    #submissions = new Set();

    constructor(url) { super(url, {headers: {Origin: origin}}); }

    send(data) {
      const {id, request} = JSON.parse(data);
      if (loss.armed && request.kind === 'reviewSubmit') {
        loss.submissions++;
        this.#submissions.add(id);
      }
      return super.send(data);
    }

    addEventListener(type, listener, options) {
      if (type !== 'message') return super.addEventListener(type, listener, options);
      return super.addEventListener(type, event => {
        const reply = JSON.parse(String(event.data));
        if (!loss.durable && this.#submissions.has(reply.id) && reply.result.kind === 'reviewAdmission' &&
            reply.result.admission.kind === 'durable') {
          loss.durable = structuredClone(reply.result.admission);
          this.close();
          return;
        }
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
      }, options);
    }
  };
}
