'use strict';

const mongoose = require('mongoose');

// MongoDB connection
mongoose.connect(process.env.DB, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Thread Schema
const replySchema = new mongoose.Schema({
  text: { type: String, required: true },
  delete_password: { type: String, required: true },
  created_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false }
});

const threadSchema = new mongoose.Schema({
  board: { type: String, required: true },
  text: { type: String, required: true },
  delete_password: { type: String, required: true },
  created_on: { type: Date, default: Date.now },
  bumped_on: { type: Date, default: Date.now },
  reported: { type: Boolean, default: false },
  replies: [replySchema]
});

const Thread = mongoose.model('Thread', threadSchema);

module.exports = function (app) {
  
  app.route('/api/threads/:board')
    
    // POST a new thread
    .post(async (req, res) => {
      try {
        const { text, delete_password } = req.body;
        const board = req.params.board;
        
        const newThread = new Thread({
          board,
          text,
          delete_password,
          created_on: new Date(),
          bumped_on: new Date(),
          replies: []
        });
        
        await newThread.save();
        res.json(newThread);
      } catch (err) {
        res.status(500).json({ error: 'Error creating thread' });
      }
    })
    
    // GET most recent 10 threads with 3 replies each
    .get(async (req, res) => {
      try {
        const board = req.params.board;
        
        const threads = await Thread.find({ board })
          .sort({ bumped_on: -1 })
          .limit(10)
          .select('-reported -delete_password')
          .lean();
        
        // Format response: only show 3 most recent replies and hide sensitive info
        const formattedThreads = threads.map(thread => ({
          _id: thread._id,
          text: thread.text,
          created_on: thread.created_on,
          bumped_on: thread.bumped_on,
          replies: thread.replies
            .sort((a, b) => b.created_on - a.created_on)
            .slice(0, 3)
            .map(reply => ({
              _id: reply._id,
              text: reply.text,
              created_on: reply.created_on
            })),
          replycount: thread.replies.length
        }));
        
        res.json(formattedThreads);
      } catch (err) {
        res.status(500).json({ error: 'Error fetching threads' });
      }
    })
    
    // DELETE a thread with password
    .delete(async (req, res) => {
      try {
        const { thread_id, delete_password } = req.body;
        
        const thread = await Thread.findById(thread_id);
        
        if (!thread) {
          return res.send('thread not found');
        }
        
        if (thread.delete_password !== delete_password) {
          return res.send('incorrect password');
        }
        
        await Thread.findByIdAndDelete(thread_id);
        res.send('success');
      } catch (err) {
        res.send('error deleting thread');
      }
    })
    
    // PUT to report a thread
    .put(async (req, res) => {
      try {
        const { thread_id } = req.body;
        
        await Thread.findByIdAndUpdate(thread_id, { reported: true });
        res.send('reported');
      } catch (err) {
        res.send('error reporting thread');
      }
    });
    
  app.route('/api/replies/:board')
    
    // POST a reply to a thread
    .post(async (req, res) => {
      try {
        const { thread_id, text, delete_password } = req.body;
        
        const newReply = {
          text,
          delete_password,
          created_on: new Date(),
          reported: false
        };
        
        const thread = await Thread.findByIdAndUpdate(
          thread_id,
          { 
            $push: { replies: newReply },
            bumped_on: new Date()
          },
          { new: true }
        );
        
        res.json(thread);
      } catch (err) {
        res.status(500).json({ error: 'Error creating reply' });
      }
    })
    
    // GET all replies for a thread
    .get(async (req, res) => {
      try {
        const { thread_id } = req.query;
        
        const thread = await Thread.findById(thread_id)
          .select('-reported -delete_password')
          .lean();
        
        if (!thread) {
          return res.status(404).json({ error: 'Thread not found' });
        }
        
        // Hide sensitive info from replies
        thread.replies = thread.replies.map(reply => ({
          _id: reply._id,
          text: reply.text,
          created_on: reply.created_on
        }));
        
        res.json(thread);
      } catch (err) {
        res.status(500).json({ error: 'Error fetching thread' });
      }
    })
    
    // DELETE a reply with password
    .delete(async (req, res) => {
      try {
        const { thread_id, reply_id, delete_password } = req.body;
        
        const thread = await Thread.findById(thread_id);
        
        if (!thread) {
          return res.send('thread not found');
        }
        
        const reply = thread.replies.id(reply_id);
        
        if (!reply) {
          return res.send('reply not found');
        }
        
        if (reply.delete_password !== delete_password) {
          return res.send('incorrect password');
        }
        
        reply.text = '[deleted]';
        await thread.save();
        res.send('success');
      } catch (err) {
        res.send('error deleting reply');
      }
    })
    
    // PUT to report a reply
    .put(async (req, res) => {
      try {
        const { thread_id, reply_id } = req.body;
        
        const thread = await Thread.findById(thread_id);
        const reply = thread.replies.id(reply_id);
        reply.reported = true;
        await thread.save();
        
        res.send('reported');
      } catch (err) {
        res.send('error reporting reply');
      }
    });
};
