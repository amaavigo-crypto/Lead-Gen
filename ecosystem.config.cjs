module.exports = {
  apps: [
    {
      name: 'lead-gen',
      script: 'server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx --env-file=.env',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};