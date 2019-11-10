import * as assert from 'assert';
import { afterEach, suite, test } from 'mocha';
import * as vscode from 'vscode';
import * as extension from '../../extension';
import * as simple from 'simple-mock';
import { V4TItem, V4TItemType } from '../../v4titem';
import { Course, Exercise, User } from '../../model';
import * as fs from 'fs';
import * as path from 'path';
import rimraf = require('rimraf');
import JSZip = require('jszip');

suite('Extension Test Suite', () => {

	afterEach(() => {
		simple.restore();
		extension.createNewCoursesProvider();
		if (fs.existsSync('v4tdownloads')) {
			rimraf('v4tdownloads', error => {
				// console.log(error);
			});
		}
		if (fs.existsSync('openworkspacetest')) {
			rimraf('openworkspacetest', error => {
				// console.log(error);
			});
		}
		let v4tPath = path.resolve(__dirname, '..', '..', 'v4t');
		if (fs.existsSync(v4tPath)) {
			rimraf(v4tPath, error => {
				// console.log(error);
			});
		}
	});

	test('should be present', () => {
		assert.ok(vscode.extensions.getExtension("codeurjc-students.vscode4teaching"));
	});

	test('should activate properly', () => {
		const extensionActivator = vscode.extensions.getExtension("codeurjc-students.vscode4teaching");
		if (extensionActivator && !extensionActivator.isActive) {
			return extensionActivator.activate().then(() => {
				assert.ok(extension.coursesProvider);
			});
		} else {
			assert.fail("Couldn't activate extension");
		}
	});

	test('should register all commands', () => {
		const extensionActivator = vscode.extensions.getExtension("codeurjc-students.vscode4teaching");
		if (extensionActivator) {
			return extensionActivator.activate().then(() => {
				return vscode.commands.getCommands(true).then((commands) => {
					const V4T_COMMANDS = [
						"vscode4teaching.addcourse",
						"vscode4teaching.login",
						"vscode4teaching.getexercisefiles",
						"vscode4teaching.editcourse",
						"vscode4teaching.deletecourse",
						"vscode4teaching.refreshcourses"
					];

					const foundCommands = commands.filter((value) => {
						return V4T_COMMANDS.indexOf(value) >= 0;
					});

					assert.equal(foundCommands.length, V4T_COMMANDS.length, "should register all commands");
				});
			});
		} else {
			assert.fail("Couldn't activate extension.");
		}
	});

	test('login', async () => {
		let mockVSCodeInputBox = simple.mock(vscode.window, "showInputBox");
		mockVSCodeInputBox.resolveWith("http://test.com").resolveWith("johndoe").resolveWith("password");
		let mockLogin = simple.mock(extension.coursesProvider.client, "login");
		let loginResponse = {
			data: { "jwtToken": "mockToken" }
		};
		mockLogin.resolveWith(loginResponse);
		let mockCsrf = simple.mock(extension.coursesProvider.client, "getCsrfToken");
		mockCsrf.resolveWith(null);
		await extension.coursesProvider.login();
		assert.deepStrictEqual(mockVSCodeInputBox.callCount, 3, "vs code should ask for server, username and password");
		assert.deepStrictEqual(mockVSCodeInputBox.calls[0].returned, Promise.resolve("http://test.com"), "server input box should return test url");
		assert.deepStrictEqual(mockVSCodeInputBox.calls[1].returned, Promise.resolve("johndoe"), "username input box should return test username");
		assert.deepStrictEqual(mockVSCodeInputBox.calls[2].returned, Promise.resolve("password"), "password input box should return test password");
		assert.deepStrictEqual(mockVSCodeInputBox.calls[0].arg, { "prompt": "Server", "validateInput": extension.coursesProvider.validateInputCustomUrl, "value": "http://localhost:8080" },
			"config for the server input box should have correct prompt, be validated and default value localhost:8080");
		assert.deepStrictEqual(mockVSCodeInputBox.calls[1].arg, { "prompt": "Username" },
			"config for the username input box should have correct prompt");
		assert.deepStrictEqual(mockVSCodeInputBox.calls[2].arg, { "prompt": "Password", "password": true },
			"config for the password input box should have correct prompt and hide the input");
		assert.deepStrictEqual(mockCsrf.callCount, 1, "csrf should be set");
		assert.deepStrictEqual(mockLogin.callCount, 1, "login should be called 1 time");
		assert.deepStrictEqual(mockLogin.lastCall.returned, Promise.resolve(loginResponse), "client login mock should resolve with a mock token");
		assert.deepStrictEqual(mockLogin.lastCall.args, ["johndoe", "password"], "client should login with the credentials above");
	});

	test('validate URL', () => {
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://localhost:8080"), null, "http://localhost:8080");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://localhost:3000"), null, "http://localhost:3000");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://192.168.99.100:8080"), null, "http://192.168.99.100:8080");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://1.2.4.3"), null, "http://1.2.4.3");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://test.com:4567"), null, "http://test.com:4567");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://api.test.com"), null, "http://api.test.com");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://test.com/api"), null, "http://test.com/api");
		assert.deepStrictEqual(extension.coursesProvider.validateInputCustomUrl("http://test.com/api:8080"), null, "http://test.com/api:8080");
	});

	test('get login button (get children, not logged in)', () => {
		let expectedButton = new V4TItem("Login", V4TItemType.Login, vscode.TreeItemCollapsibleState.None, undefined, undefined, {
			"command": "vscode4teaching.login",
			"title": "Log in to VS Code 4 Teaching"
		});


		let loginButton = extension.coursesProvider.getChildren();
		if (loginButton instanceof Array) {
			assert.deepStrictEqual(loginButton[0], expectedButton);
		} else {
			assert.fail("loginButton is not an array");
		}
	});

	test('get courses (get children, logged in)', () => {
		let getJwtTokenMock = simple.mock(extension.coursesProvider.client, "getJwtToken");
		getJwtTokenMock.returnWith("mockToken");
		let user: User = {
			id: 20,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				}
			],
			courses: [
				{
					id: 23,
					name: "Spring Boot Course 1",
					exercises: []
				},
				{
					id: 52,
					name: "Angular Course 1",
					exercises: []
				}
			]
		};
		if (user.courses) {
			let expectedButtons = user.courses.map(course => new V4TItem(course.name, V4TItemType.CourseStudent, vscode.TreeItemCollapsibleState.Collapsed, undefined, course));
			extension.coursesProvider.userinfo = user;
			extension.coursesProvider.client.jwtToken = "mockToken";

			let courseButtons = extension.coursesProvider.getChildren();

			if (courseButtons instanceof Array) {
				assert.deepStrictEqual(courseButtons, expectedButtons);
			} else {
				assert.fail("courseButtons is not an array");
			}
		} else {
			assert.fail("user courses don't exist");
		}
	});

	test('get courses with add button (get children, logged in, is teacher)', () => {
		let getJwtTokenMock = simple.mock(extension.coursesProvider.client, "getJwtToken");
		getJwtTokenMock.returnWith("mockToken");
		let user: User = {
			id: 20,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			],
			courses: [
				{
					id: 23,
					name: "Spring Boot Course 1",
					exercises: []
				},
				{
					id: 52,
					name: "Angular Course 1",
					exercises: []
				}
			]
		};
		if (user.courses) {
			let expectedButtons = user.courses.map(course => new V4TItem(course.name, V4TItemType.CourseTeacher, vscode.TreeItemCollapsibleState.Collapsed, undefined, course));
			expectedButtons.unshift(new V4TItem("Add Course", V4TItemType.AddCourse, vscode.TreeItemCollapsibleState.None, undefined, undefined, {
				command: "vscode4teaching.addcourse",
				title: "Add Course"
			}));
			extension.coursesProvider.userinfo = user;
			extension.coursesProvider.client.jwtToken = "mockToken";

			let courseButtons = extension.coursesProvider.getChildren();

			if (courseButtons instanceof Array) {
				assert.deepStrictEqual(courseButtons, expectedButtons);
			} else {
				assert.fail("courseButtons is not an array");
			}
		} else {
			assert.fail("user courses don't exist");
		}
	});

	test('get exercises (get children, element)', async () => {
		let user: User = {
			id: 343,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				}
			]
		};
		let course: Course = {
			id: 123,
			name: "Spring Boot Course",
			exercises: []
		};
		user.courses = [course];
		let courseItem = new V4TItem(course.name, V4TItemType.CourseStudent, vscode.TreeItemCollapsibleState.Collapsed, undefined, course);
		extension.coursesProvider.userinfo = user;
		let exercises: Exercise[] = [{
			id: 4,
			name: "Exercise 1"
		},
		{
			id: 5,
			name: "Exercise 2"
		},
		{
			id: 6,
			name: "Exercise 3"
		}];
		let exerciseItems = exercises.map(exercise => new V4TItem(exercise.name, V4TItemType.ExerciseStudent, vscode.TreeItemCollapsibleState.None, courseItem, exercise, {
			"command": "vscode4teaching.getexercisefiles",
			"title": "Get exercise files",
			"arguments": [course.name, exercise]
		}));
		let getExercisesMock = simple.mock(extension.coursesProvider.client, "getExercises");
		getExercisesMock.resolveWith({ data: exercises });

		extension.coursesProvider.getChildren(courseItem);

		await new Promise(resolve => setTimeout(resolve, 10)); // Wait for exercises to "download"

		let newExerciseItems = extension.coursesProvider.getChildren(courseItem);
		assert.deepStrictEqual(exerciseItems, newExerciseItems);

	});

	test('get exercises (get children, element, is teacher)', async () => {
		let user: User = {
			id: 343,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			]
		};
		let course: Course = {
			id: 123,
			name: "Spring Boot Course",
			exercises: []
		};
		user.courses = [course];
		let courseItem = new V4TItem(course.name, V4TItemType.CourseTeacher, vscode.TreeItemCollapsibleState.Collapsed, undefined, course);
		extension.coursesProvider.userinfo = user;
		let exercises: Exercise[] = [{
			id: 4,
			name: "Exercise 1"
		},
		{
			id: 5,
			name: "Exercise 2"
		},
		{
			id: 6,
			name: "Exercise 3"
		}];
		let exerciseItems = exercises.map(exercise => new V4TItem(exercise.name, V4TItemType.ExerciseTeacher, vscode.TreeItemCollapsibleState.None, courseItem, exercise, {
			"command": "vscode4teaching.getexercisefiles",
			"title": "Get exercise files",
			"arguments": [course.name, exercise]
		}));
		let getExercisesMock = simple.mock(extension.coursesProvider.client, "getExercises");
		getExercisesMock.resolveWith({ data: exercises });

		extension.coursesProvider.getChildren(courseItem);

		await new Promise(resolve => setTimeout(resolve, 10)); // Wait for exercises to "download"

		let newExerciseItems = extension.coursesProvider.getChildren(courseItem);
		assert.deepStrictEqual(exerciseItems, newExerciseItems);
	});

	test('get exercise files', async () => {
		let user: User = {
			id: 343,
			username: "johndoe",
			roles: []
		};
		let getExercisesMock = simple.mock(extension.coursesProvider.client, "getExerciseFiles");
		let filePath = path.resolve(__dirname, "..", "..", "..", 'test-resources', 'files', 'exs.zip');
		getExercisesMock.resolveWith({
			data: fs.readFileSync(filePath)
		});
		extension.coursesProvider.userinfo = user;
		let newWorkspaceURI = await extension.coursesProvider.getExerciseFiles("Spring Boot Course", { id: 4, name: "Exercise 1" });
		await new Promise(resolve => setTimeout(resolve, 200)); // Wait for exercises to "download"
		let ex1Path = path.resolve('v4tdownloads', 'johndoe', 'Spring Boot Course', 'Exercise 1');
		assert.deepStrictEqual(fs.existsSync(path.resolve(ex1Path, 'ex1.html')), true, "ex1 exists");
		assert.deepStrictEqual(fs.existsSync(path.resolve(ex1Path, 'ex2.html')), true, "ex2 exists");
		assert.deepStrictEqual(fs.existsSync(path.resolve(ex1Path, 'exs', 'ex3.html')), true, "ex3 exists");
		assert.deepStrictEqual(fs.existsSync(path.resolve(ex1Path, 'exs', 'ex4', 'ex4.html')), true, "ex4 exists");
		assert.deepStrictEqual(newWorkspaceURI, ex1Path, "uri is correct");
	});

	test('if session file exists', () => {
		extension.coursesProvider.client.jwtToken = undefined;
		let existsMock = simple.mock(fs, "existsSync");
		existsMock.returnWith(true);
		let fileMock = simple.mock(fs, "readFileSync");
		fileMock.returnWith(new MockFile("mockToken\nmockXsrf\nmockUrl"));
		let userInfoMock = simple.mock(extension.coursesProvider.client, "getUserInfo");
		userInfoMock.resolveWith({
			id: 1,
			name: "johndoe"
		});
		extension.coursesProvider.getChildren();

		assert.deepStrictEqual(extension.coursesProvider.client.jwtToken, "mockToken");
		assert.deepStrictEqual(extension.coursesProvider.client.xsrfToken, "mockXsrf");
		assert.deepStrictEqual(extension.coursesProvider.client.baseUrl, "mockUrl");
	});

	test('refresh should call getUserInfo', () => {
		extension.coursesProvider.client.jwtToken = "mockToken";
		let userInfoMock = simple.mock(extension.coursesProvider, "getUserInfo");
		extension.coursesProvider.refreshCourses();
		assert.deepStrictEqual(userInfoMock.callCount, 1);
	});

	test('add course', async () => {
		let course: Course = {
			id: 123,
			name: "Test course",
			exercises: []
		};
		let addCourseClientMock = simple.mock(extension.coursesProvider.client, "addCourse");
		addCourseClientMock.resolveWith(course);
		let vscodeInputMock = simple.mock(vscode.window, "showInputBox");
		vscodeInputMock.resolveWith("Test course");
		let user: User = {
			id: 456,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			],
			courses: [course]
		};
		let userInfoMock = simple.mock(extension.coursesProvider.client, "getUserInfo");
		userInfoMock.resolveWith(user);
		await extension.coursesProvider.addCourse();
		if (extension.coursesProvider.userinfo && extension.coursesProvider.userinfo.courses) {
			assert.deepStrictEqual(extension.coursesProvider.userinfo.courses, [course]);
		}
	});

	test('delete course', async () => {
		let course: Course = {
			id: 123,
			name: "Test course",
			exercises: []
		};
		let deleteCourseClientMock = simple.mock(extension.coursesProvider.client, "deleteCourse");
		deleteCourseClientMock.resolveWith(course);
		let vscodeInputMock = simple.mock(vscode.window, "showWarningMessage");
		vscodeInputMock.resolveWith("Accept");
		let user: User = {
			id: 456,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			],
			courses: [course]
		};
		extension.coursesProvider.userinfo = user;
		let newUser: User = {
			id: 456,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			],
			courses: []
		};
		let userInfoMock = simple.mock(extension.coursesProvider.client, "getUserInfo");
		userInfoMock.resolveWith({ data: newUser });
		await extension.coursesProvider.deleteCourse(course);
		if (extension.coursesProvider.userinfo && extension.coursesProvider.userinfo.courses) {
			assert.deepStrictEqual(extension.coursesProvider.userinfo.courses, []);
		}
	});

	test('edit course', async () => {
		let course: Course = {
			id: 123,
			name: "Test course",
			exercises: [
				{
					id: 111,
					name: "Exercise 1"
				}
			]
		};
		let newCourse: Course = {
			id: 123,
			name: "Test course edited",
			exercises: [
				{
					id: 111,
					name: "Exercise 1"
				}
			]
		};
		let editCourseClientMock = simple.mock(extension.coursesProvider.client, "editCourse");
		editCourseClientMock.resolveWith(newCourse);
		let vscodeInputMock = simple.mock(vscode.window, "showInputBox");
		vscodeInputMock.resolveWith("Test course");
		let user: User = {
			id: 456,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			],
			courses: [course]
		};
		let newUser: User = {
			id: 456,
			username: "johndoe",
			roles: [
				{
					roleName: "ROLE_STUDENT"
				},
				{
					roleName: "ROLE_TEACHER"
				}
			],
			courses: [newCourse]
		};
		let userInfoMock = simple.mock(extension.coursesProvider.client, "getUserInfo");
		userInfoMock.resolveWith({ data: newUser });
		extension.coursesProvider.userinfo = user;
		await extension.coursesProvider.editCourse(course);
		if (extension.coursesProvider.userinfo && extension.coursesProvider.userinfo.courses) {
			assert.deepStrictEqual(extension.coursesProvider.userinfo.courses, [newCourse]);
		}
	});

	test('refresh exercises', async () => {
		let course: Course = {
			id: 1234,
			name: "Test course",
			exercises: [
				{
					id: 5678,
					name: "Test exercise"
				}
			]
		};
		let courseItem = new V4TItem(course.name, V4TItemType.CourseTeacher, vscode.TreeItemCollapsibleState.Collapsed, undefined, course);
		// This method has already been tested, can be mocked
		let getExercisesMock = simple.mock(extension.coursesProvider, "getExercises");
		extension.coursesProvider.refreshExercises(courseItem);
		assert.deepStrictEqual(getExercisesMock.callCount, 1);
	});

	test('add exercise', async () => {
		let nameMock = simple.mock(vscode.window, "showInputBox");
		nameMock.resolveWith("Test exercise");
		let openDialogMock = simple.mock(vscode.window, 'showOpenDialog');
		let filesPath = path.resolve(__dirname, "..", "..", "..", 'test-resources', 'files');
		let ex1Path = path.resolve(filesPath, 'ex1.html');
		let ex2Path = path.resolve(filesPath, 'ex2.html');
		let exsPath = path.resolve(filesPath, 'exs');
		openDialogMock.resolveWith([
			vscode.Uri.file(ex1Path),
			vscode.Uri.file(ex2Path),
			vscode.Uri.file(exsPath)
		]);
		let mockCourse: Course = {
			id: 345,
			name: "Test course",
			exercises: []
		};
		let clientAddMock = simple.mock(extension.coursesProvider.client, "addExercise");
		let exerciseDataMock: Exercise = {
			id: 123,
			name: "Test exercise"
		};
		clientAddMock.resolveWith({ data: exerciseDataMock });
		let clientTemplateMock = simple.mock(extension.coursesProvider.client, "uploadExerciseTemplate");
		clientTemplateMock.resolveWith(null);
		let refreshExercisesMock = simple.mock(extension.coursesProvider, "refreshExercises");
		let mockItem = new V4TItem("Test course", V4TItemType.CourseTeacher, vscode.TreeItemCollapsibleState.Expanded, undefined, mockCourse);
		await extension.coursesProvider.addExercise(mockItem);

		assert.deepStrictEqual(clientAddMock.lastCall.args[0], 345, "addExercise should get correct course id");
		assert.deepStrictEqual(clientAddMock.lastCall.args[1], "Test exercise", "addExercise should get name gotten on showInputBox");

		assert.deepStrictEqual(clientTemplateMock.lastCall.args[0], 123, "uploadExerciseTemplate should get correct exercise id");

		//Assertions on template data sent
		let zipContent: Buffer = clientTemplateMock.lastCall.args[1];
		let zip = new JSZip();
		let zipEntries: string[] = [];
		zip = await zip.loadAsync(zipContent);
		zip.forEach((relativePath, file) => {
			zipEntries.push(relativePath);
		});

		console.log(zipEntries);
		// Depending on system directories can be saved as entries or whole path can be saved
		assert.deepStrictEqual([4, 6].includes(zipEntries.length), true, "there should be 4 or 6 entries in the zip");
		assert.deepStrictEqual(zipEntries.includes("ex1.html"), true, "ex1.html should be saved");
		assert.deepStrictEqual(zipEntries.includes("ex2.html"), true, "ex2.html should be saved");
		assert.deepStrictEqual(zipEntries.includes("exs" + path.sep + "ex3.html"), true, "exs/ex3.html should be saved");
		assert.deepStrictEqual(zipEntries.includes("exs" + path.sep + "ex4" + path.sep + "ex4.html"), true, "exs/ex4/ex4.html should be saved");


		assert.deepStrictEqual(refreshExercisesMock.callCount, 1, "exercises should be refreshed");
	});

	test('edit exercise', async () => {
		let exercise: Exercise = {
			id: 1,
			name: "Test exercise"
		};
		let course: Course = {
			id: 2,
			name: "Test course",
			exercises: [exercise]
		};
		let courseItem = new V4TItem("Test course", V4TItemType.CourseTeacher, vscode.TreeItemCollapsibleState.Expanded, undefined, course, undefined);
		let exerciseItem = new V4TItem("Test exercise", V4TItemType.ExerciseTeacher, vscode.TreeItemCollapsibleState.None, courseItem, exercise, undefined);
		let inputMock = simple.mock(vscode.window, "showInputBox");
		inputMock.resolveWith("Edited exercise");
		let clientMock = simple.mock(extension.coursesProvider.client, "editExercise");
		clientMock.resolveWith(null); // Not needed
		await extension.coursesProvider.editExercise(exerciseItem);

		assert.deepStrictEqual(clientMock.callCount, 1, "editExercise is called");
		assert.deepStrictEqual(clientMock.lastCall.args[0], 1, "exercise id is passed");
		assert.deepStrictEqual(clientMock.lastCall.args[1], "Edited exercise", "new exercise name is passed");
	});
});

class MockFile {
	private text: string;
	constructor(text: string) {
		this.text = text;
	}

	toString() {
		return this.text;
	}
}