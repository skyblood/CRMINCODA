/**
 * Shared Socket.io instance.
 * Avoids circular imports — routes import this, not server/index.js
 */
let _io = null;

export const setIo = (io) => { _io = io; };

export const getIo = () => _io;

/**
 * Emit a collection-change event so all connected clients can
 * refresh the affected collection without waiting for the next poll.
 *
 * @param {string} collection  e.g. 'leads', 'projects'
 * @param {string} operation   'created' | 'updated' | 'deleted' | 'batch_scored'
 * @param {object} doc         The affected document (or partial data)
 */
export const emitCollectionChange = (collection, operation, doc) => {
    if (_io) {
        _io.emit('collection:change', { collection, operation, doc });
    }
};
