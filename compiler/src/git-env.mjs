// Git hooks export variables that pin every git command to the hooked repository; a child process that runs git
// elsewhere (a temporary repository in a check's tests, say) must not inherit them.
const REPO_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'];

export const cleanGitEnv = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !REPO_ENV.includes(k)));
