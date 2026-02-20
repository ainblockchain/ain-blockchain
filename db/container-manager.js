const logger = new (require('../logger'))('CONTAINER_MANAGER');
const { execSync, spawn } = require('child_process');

class ContainerManager {
  constructor(config) {
    this.config = config || {};
    this.dockerNetwork = config.dockerNetwork || 'ain-blockchain_default';
    this.allowedRegistries = config.allowedRegistries || ['ghcr.io'];
    this._enabled = false;
    this._deployments = new Map(); // containerId -> deployment info
  }

  async initialize() {
    try {
      // Verify Docker is available
      execSync('docker --version', { stdio: 'pipe' });
      this._enabled = true;
      logger.info('Container Manager initialized.');
    } catch (err) {
      this._enabled = false;
      logger.error(`Container Manager: Docker not available: ${err.message}`);
    }
  }

  isEnabled() { return this._enabled; }

  // Authorize a GitHub user's GHCR namespace
  authorize(githubUsername) {
    const registry = `ghcr.io/${githubUsername.toLowerCase()}`;
    if (!this.allowedRegistries.includes(registry)) {
      this.allowedRegistries.push(registry);
      logger.info(`Authorized registry: ${registry}`);
    }
    return { authorized: true, registry };
  }

  // Check if an image is from an authorized registry
  _isAuthorized(image) {
    return this.allowedRegistries.some(r => image.startsWith(r));
  }

  // Deploy a container
  async deploy(params) {
    const { image, name, envVars, ports } = params;

    if (!image) throw new Error('image is required');
    if (!this._isAuthorized(image)) {
      throw new Error(`Image "${image}" is not from an authorized registry. Authorized: ${this.allowedRegistries.join(', ')}`);
    }

    const containerName = name || `cogito-${Date.now()}`;

    // Stop existing container with same name
    try {
      execSync(`docker stop ${containerName} 2>/dev/null && docker rm ${containerName} 2>/dev/null`, { stdio: 'pipe' });
    } catch {}

    // Pull image
    logger.info(`Pulling image: ${image}`);
    execSync(`docker pull ${image}`, { stdio: 'pipe', timeout: 120000 });

    // Build docker run command
    const args = ['run', '-d', '--name', containerName, '--network', this.dockerNetwork, '--restart', 'unless-stopped'];

    if (envVars && typeof envVars === 'object') {
      for (const [key, value] of Object.entries(envVars)) {
        // Security: don't allow shell injection via env vars
        const safeKey = key.replace(/[^A-Za-z0-9_]/g, '');
        const safeValue = String(value).replace(/'/g, "'\\''");
        args.push('-e', `${safeKey}=${safeValue}`);
      }
    }

    if (ports && typeof ports === 'object') {
      for (const [host, container] of Object.entries(ports)) {
        const safeHost = String(host).replace(/[^0-9]/g, '');
        const safeContainer = String(container).replace(/[^0-9]/g, '');
        args.push('-p', `${safeHost}:${safeContainer}`);
      }
    }

    args.push(image);

    // Run container
    logger.info(`Starting container: ${containerName}`);
    const containerId = execSync(`docker ${args.join(' ')}`, { encoding: 'utf-8', timeout: 30000 }).trim();

    const deployment = {
      containerId: containerId.slice(0, 12),
      containerName,
      image,
      status: 'running',
      started_at: Date.now(),
    };

    this._deployments.set(containerName, deployment);
    logger.info(`Container deployed: ${containerName} (${deployment.containerId})`);

    return deployment;
  }

  // Get deployment status
  async status(containerName) {
    try {
      const output = execSync(
        `docker inspect --format='{{.State.Status}}' ${containerName}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      const deployment = this._deployments.get(containerName) || {};
      return { ...deployment, containerName, status: output };
    } catch {
      return { containerName, status: 'not_found' };
    }
  }

  // Stop a container
  async stop(containerName) {
    try {
      execSync(`docker stop ${containerName}`, { stdio: 'pipe', timeout: 30000 });
      execSync(`docker rm ${containerName}`, { stdio: 'pipe' });
      this._deployments.delete(containerName);
      logger.info(`Container stopped: ${containerName}`);
      return { containerName, status: 'stopped' };
    } catch (err) {
      throw new Error(`Failed to stop ${containerName}: ${err.message}`);
    }
  }

  // Get container logs
  async logs(containerName, tail = 100) {
    try {
      const safeTail = Math.min(Math.max(parseInt(tail) || 100, 1), 1000);
      const output = execSync(
        `docker logs --tail ${safeTail} ${containerName}`,
        { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 }
      );
      return { containerName, logs: output };
    } catch (err) {
      throw new Error(`Failed to get logs for ${containerName}: ${err.message}`);
    }
  }

  // List all managed deployments
  async list() {
    const deployments = [];
    for (const [name, info] of this._deployments) {
      const current = await this.status(name);
      deployments.push(current);
    }
    return deployments;
  }
}

module.exports = ContainerManager;
