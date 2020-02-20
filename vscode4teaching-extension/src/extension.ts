import * as vscode from 'vscode';
import { CoursesProvider } from './courses';
import { Exercise, FileInfo } from './model/serverModel';
import { V4TItem } from './v4titem';
import * as path from 'path';
import * as fs from 'fs';
import JSZip = require('jszip');
import { V4TExerciseFile } from './model/v4texerciseFile';
import { FileIgnoreUtil } from './fileIgnoreUtil';
import { TeacherCommentProvider } from './teacherComments';
import { Dictionary } from './model/dictionary';
import { RestClient } from './restclient';
import mkdirp = require('mkdirp');

export let coursesProvider = new CoursesProvider();
let templates: Dictionary<string> = {};
let commentProvider: TeacherCommentProvider | undefined;
export function activate(context: vscode.ExtensionContext) {
	vscode.window.registerTreeDataProvider('vscode4teachingview', coursesProvider);
	let sessionPath = path.resolve(__dirname, 'v4t', 'v4tsession');
	if (fs.existsSync(sessionPath)) {
		let readSession = fs.readFileSync(sessionPath).toString();
		let sessionParts = readSession.split('\n');
		let client = RestClient.getClient();
		client.jwtToken = sessionParts[0];
		client.xsrfToken = sessionParts[1];
		client.baseUrl = sessionParts[2];
		coursesProvider.getUserInfo().catch((error) => coursesProvider.handleAxiosError(error));
	}
	// If cwd is a v4t exercise run file system watcher
	let cwds = vscode.workspace.workspaceFolders;
	if (cwds) {
		enableFSWIfExercise(cwds);
	}

	let loginDisposable = vscode.commands.registerCommand('vscode4teaching.login', () => {
		coursesProvider.login();
	});

	let getFilesDisposable = vscode.commands.registerCommand('vscode4teaching.getexercisefiles', (courseName: string, exercise: Exercise) => {
		coursesProvider.getExerciseFiles(courseName, exercise).then(async (newWorkspaceURI) => {
			if (newWorkspaceURI) {
				let uri = vscode.Uri.file(newWorkspaceURI);
				// Get file info for id references
				let client = RestClient.getClient();
				if (coursesProvider && coursesProvider.userinfo) {
					let username = coursesProvider.userinfo.username;
					let fileInfoPath = path.resolve(coursesProvider.internalFilesDir, username, ".fileInfo", exercise.name);
					if (!fs.existsSync(fileInfoPath)) {
						mkdirp.sync(fileInfoPath);
					}
					client.getFilesInfo(username, exercise.id).then(
						filesInfo => {
							fs.writeFileSync(path.resolve(fileInfoPath, username + ".json"), JSON.stringify(filesInfo.data), { encoding: "utf8" });
						}
					).catch(error => coursesProvider.handleAxiosError(error));
				}
				vscode.workspace.updateWorkspaceFolders(0,
					vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
					{ uri: uri, name: exercise.name });
				cwds = vscode.workspace.workspaceFolders;
				if (cwds) {
					enableFSWIfExercise(cwds);
				}
			}
		});
	});

	let addCourseDisposable = vscode.commands.registerCommand('vscode4teaching.addcourse', () => {
		coursesProvider.addCourse();
	});

	let editCourseDisposable = vscode.commands.registerCommand('vscode4teaching.editcourse', (item: V4TItem) => {
		coursesProvider.editCourse(item);
	});

	let deleteCourseDisposable = vscode.commands.registerCommand('vscode4teaching.deletecourse', (item: V4TItem) => {
		coursesProvider.deleteCourse(item);
	});

	let refreshView = vscode.commands.registerCommand('vscode4teaching.refreshcourses', () => {
		coursesProvider.refreshCourses();
	});

	let refreshCourse = vscode.commands.registerCommand('vscode4teaching.refreshexercises', (item: V4TItem) => {
		coursesProvider.refreshExercises(item);
	});

	let addExercise = vscode.commands.registerCommand('vscode4teaching.addexercise', (item: V4TItem) => {
		coursesProvider.addExercise(item);
	});

	let editExercise = vscode.commands.registerCommand('vscode4teaching.editexercise', (item: V4TItem) => {
		coursesProvider.editExercise(item);
	});

	let deleteExercise = vscode.commands.registerCommand('vscode4teaching.deleteexercise', (item: V4TItem) => {
		coursesProvider.deleteExercise(item);
	});

	let addUsersToCourse = vscode.commands.registerCommand('vscode4teaching.adduserstocourse', (item: V4TItem) => {
		coursesProvider.addUsersToCourse(item);
	});

	let removeUsersFromCourse = vscode.commands.registerCommand('vscode4teaching.removeusersfromcourse', (item: V4TItem) => {
		coursesProvider.removeUsersFromCourse(item);
	});

	let getStudentFiles = vscode.commands.registerCommand('vscode4teaching.getstudentfiles', (courseName: string, exercise: Exercise) => {
		coursesProvider.getStudentFiles(courseName, exercise).then(async (newWorkspaceURI) => {
			if (newWorkspaceURI && newWorkspaceURI[1]) {
				let wsURI: string = newWorkspaceURI[1];
				let directories = fs.readdirSync(newWorkspaceURI[1], { withFileTypes: true })
					.filter(dirent => dirent.isDirectory());
				// Get file info for id references
				if (coursesProvider && coursesProvider.userinfo) {
					let fileInfoPath = path.resolve(coursesProvider.internalFilesDir, coursesProvider.userinfo.username, ".fileInfo", exercise.name);
					if (!fs.existsSync(fileInfoPath)) {
						mkdirp.sync(fileInfoPath);
					}
					let directoriesWithoutTemplate = directories.filter(dirent => !dirent.name.includes("template"));
					let client = RestClient.getClient();
					directoriesWithoutTemplate.forEach(dirent => {
						client.getFilesInfo(dirent.name, exercise.id).then(
							filesInfo => {
								fs.writeFileSync(path.resolve(fileInfoPath, dirent.name + ".json"), JSON.stringify(filesInfo.data), { encoding: "utf8" });
							}
						).catch(error => coursesProvider.handleAxiosError(error));
					});
				}
				let subdirectoriesURIs = directories.map(dirent => {
					return {
						uri: vscode.Uri.file(path.resolve(wsURI, dirent.name))
					};
				});
				//open all student files and template
				vscode.workspace.updateWorkspaceFolders(0,
					vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
					...subdirectoriesURIs);
				cwds = vscode.workspace.workspaceFolders;
				if (cwds) {
					enableFSWIfExercise(cwds);
				}
			}
		});
	});

	let diff = vscode.commands.registerCommand('vscode4teaching.diff', (file: vscode.Uri) => {
		let wf = vscode.workspace.getWorkspaceFolder(file);
		if (wf) {
			let relativePath = path.relative(wf.uri.fsPath, file.fsPath);
			let templateFile = path.resolve(templates[wf.name], relativePath);
			if (fs.existsSync(templateFile)) {
				let templateFileUri = vscode.Uri.file(templateFile);
				vscode.commands.executeCommand('vscode.diff', file, templateFileUri);
			} else {
				vscode.window.showErrorMessage("File doesn't exist in the template.");
			}
		}
	});

	let createComment = vscode.commands.registerCommand('vscode4teaching.createComment', (reply: vscode.CommentReply) => {
		if (commentProvider && coursesProvider && coursesProvider.userinfo) {
			let filePath = reply.thread.uri.fsPath;
			let separator = path.sep;
			let currentUsername = coursesProvider.userinfo.username;
			let teacherRelativePath = filePath.split(separator + currentUsername + separator)[1];
			let teacherRelativePathSplit = teacherRelativePath.split(separator);
			let exerciseName = teacherRelativePathSplit[1];
			// If teacher use username from student, else use own
			let currentUserIsTeacher = coursesProvider.userinfo.roles.filter(role => role.roleName === 'ROLE_TEACHER').length > 0;
			let username = currentUserIsTeacher ? teacherRelativePathSplit[2] : currentUsername;

			let fileInfoPath = path.resolve(coursesProvider.internalFilesDir, coursesProvider.userinfo.username, ".fileInfo", exerciseName, username + ".json");
			let fileInfoArray: FileInfo[] = JSON.parse(fs.readFileSync(fileInfoPath, { encoding: "utf8" }));
			let fileRelativePath = currentUserIsTeacher ? filePath.split(separator + username + separator)[1] : filePath.split(separator + exerciseName + separator)[1];
			let fileInfo = fileInfoArray.find((file: FileInfo) => file.path === fileRelativePath);
			if (fileInfo) {
				commentProvider.replyNote(reply, fileInfo.id, coursesProvider.handleAxiosError);
			} else {
				vscode.window.showErrorMessage("Error retrieving file id, please download the exercise again.");
			}
		}
	});

	context.subscriptions.push(loginDisposable, getFilesDisposable, addCourseDisposable, editCourseDisposable,
		deleteCourseDisposable, refreshView, refreshCourse, addExercise, editExercise, deleteExercise, addUsersToCourse,
		removeUsersFromCourse, getStudentFiles, diff, createComment);
}

export function deactivate() {
	if (commentProvider) {
		commentProvider.dispose();
	}
}

// Meant to be used for tests
export function createNewCoursesProvider() {
	coursesProvider = new CoursesProvider();
}

export function enableFSWIfExercise(cwds: vscode.WorkspaceFolder[]) {
	let checkedUris: string[] = [];
	cwds.forEach((cwd: vscode.WorkspaceFolder) => {
		// Checks recursively from parent directory of cwd for v4texercise.v4t
		let parentDir = path.resolve(cwd.uri.fsPath, '..');
		if (!checkedUris.includes(parentDir)) {
			vscode.workspace.findFiles(new vscode.RelativePattern(parentDir, '**/v4texercise.v4t'), null, 1).then(uris => {
				checkedUris.push(parentDir);
				if (uris.length > 0) {
					let v4tjson: V4TExerciseFile = JSON.parse(fs.readFileSync(path.resolve(uris[0].fsPath), { encoding: "utf8" }));
					// Zip Uri should be in the text file
					let zipUri = path.resolve(v4tjson.zipLocation);
					// Exercise id is in the name of the zip file
					let zipSplit = zipUri.split(path.sep);
					let exerciseId: number = +zipSplit[zipSplit.length - 1].split("\.")[0];
					if (!commentProvider && coursesProvider.userinfo) {
						commentProvider = new TeacherCommentProvider(coursesProvider.userinfo.username);
					}
					if (commentProvider && coursesProvider.userinfo) {
						commentProvider.addCwd(cwd);
						// Download comments
						if (cwd.name !== "template") {
							let currentUserIsTeacher = coursesProvider.userinfo.roles.filter(role => role.roleName === 'ROLE_TEACHER').length > 0;
							let username: string = currentUserIsTeacher ? cwd.name : coursesProvider.userinfo.username;
							commentProvider.getThreads(exerciseId, username, cwd, coursesProvider.handleAxiosError);
						}
					}
					// Set template location if exists
					if (v4tjson.teacher && v4tjson.template) {
						// Template should be the same in the workspace
						templates[cwd.name] = v4tjson.template;
					}
					let jszipFile = new JSZip();
					if (!v4tjson.teacher && fs.existsSync(zipUri)) {
						let ignoredFiles: string[] = FileIgnoreUtil.recursiveReadGitIgnores(cwd.uri.fsPath);
						jszipFile.loadAsync(fs.readFileSync(zipUri));
						let pattern = new vscode.RelativePattern(cwd, "**/*");
						let fsw = vscode.workspace.createFileSystemWatcher(pattern);
						fsw.onDidChange((e: vscode.Uri) => {
							if (!ignoredFiles.includes(e.fsPath)) {
								updateFile(e, exerciseId, jszipFile, cwd);
							}
						});
						fsw.onDidCreate((e: vscode.Uri) => {
							if (!ignoredFiles.includes(e.fsPath)) {
								updateFile(e, exerciseId, jszipFile, cwd);
							}
						});
						fsw.onDidDelete((e: vscode.Uri) => {
							if (!ignoredFiles.includes(e.fsPath)) {
								let filePath = path.resolve(e.fsPath);
								filePath = path.relative(cwd.uri.fsPath, filePath);
								jszipFile.remove(filePath);
								let thenable = jszipFile.generateAsync({ type: "nodebuffer" });
								vscode.window.setStatusBarMessage("Uploading files...", thenable);
								thenable.then(zipData => RestClient.getClient().uploadFiles(exerciseId, zipData))
									.catch(err => coursesProvider.handleAxiosError(err));
							}
						});
					}
				}
			});
		}
	});

}

function updateFile(e: vscode.Uri, exerciseId: number, jszipFile: JSZip, cwd: vscode.WorkspaceFolder) {
	let filePath = path.resolve(e.fsPath);
	fs.readFile(filePath, (err, data) => {
		filePath = path.relative(cwd.uri.fsPath, filePath);
		if (!filePath.includes("v4texercise.v4t")) {
			if (err) { throw (err); }
			jszipFile.file(filePath, data);
			let thenable = jszipFile.generateAsync({ type: "nodebuffer" });
			vscode.window.setStatusBarMessage("Uploading files...", thenable);
			thenable.then(zipData => RestClient.getClient().uploadFiles(exerciseId, zipData))
				.catch(err => coursesProvider.handleAxiosError(err));
		}
	});
}