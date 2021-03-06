import { AxiosResponse } from "axios";
import * as fs from "fs";
import * as JSZip from "jszip";
import * as path from "path";
import { mocked } from "ts-jest/utils";
import * as vscode from "vscode";
import { APIClient } from "../../src/client/APIClient";
import { CurrentUser } from "../../src/client/CurrentUser";
import { CoursesProvider } from "../../src/components/courses/CoursesTreeProvider";
import * as extension from "../../src/extension";
import { Exercise } from "../../src/model/serverModel/exercise/Exercise";
import { ExerciseUserInfo } from "../../src/model/serverModel/exercise/ExerciseUserInfo";
import { User } from "../../src/model/serverModel/user/User";
import { TeacherCommentService } from "../../src/services/TeacherCommentsService";
import { FileIgnoreUtil } from "../../src/utils/FileIgnoreUtil";

jest.mock("../../src/client/CurrentUser");
const mockedCurrentUser = mocked(CurrentUser, true);
jest.mock("../../src/components/courses/CoursesTreeProvider");
const mockedCoursesTreeProvider = mocked(CoursesProvider, true);
jest.mock("vscode");
const mockedVscode = mocked(vscode, true);
jest.mock("../../src/client/APIClient");
const mockedClient = mocked(APIClient, true);
jest.mock("path");
const mockedPath = mocked(path, true);
jest.mock("fs");
const mockedFs = mocked(fs, true);
jest.mock("../../src/services/TeacherCommentsService");
const mockedTeacherCommentService = mocked(TeacherCommentService, true);
jest.mock("../../src/utils/FileIgnoreUtil");
const mockedFileIgnoreUtil = mocked(FileIgnoreUtil, true);
jest.mock("jszip");
const mockedJSZip = mocked(JSZip, true);

jest.useFakeTimers();

const ec: vscode.ExtensionContext = {
    subscriptions: [],
    workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
    },
    globalState: {
        get: jest.fn(),
        update: jest.fn(),
    },
    extensionUri: mockedVscode.Uri.parse("test"),
    extensionPath: "test",
    asAbsolutePath: jest.fn(),
    storagePath: "test",
    globalStoragePath: "test",
    logPath: "test",
};

describe("Extension entry point", () => {
    const commandIds: string[] = [
        "vscode4teaching.login",
        "vscode4teaching.logout",
        "vscode4teaching.getexercisefiles",
        "vscode4teaching.getstudentfiles",
        "vscode4teaching.addcourse",
        "vscode4teaching.editcourse",
        "vscode4teaching.deletecourse",
        "vscode4teaching.refreshcourses",
        "vscode4teaching.refreshexercises",
        "vscode4teaching.addexercise",
        "vscode4teaching.editexercise",
        "vscode4teaching.deleteexercise",
        "vscode4teaching.adduserstocourse",
        "vscode4teaching.removeusersfromcourse",
        "vscode4teaching.diff",
        "vscode4teaching.createComment",
        "vscode4teaching.share",
        "vscode4teaching.signup",
        "vscode4teaching.signupteacher",
        "vscode4teaching.getwithcode",
        "vscode4teaching.finishexercise",
        "vscode4teaching.showdashboard",
    ];
    function expectAllCommandsToBeRegistered(subscriptions: any[]) {
        expect(subscriptions).toHaveLength(commandIds.length);
        expect(mockedVscode.commands.registerCommand).toHaveBeenCalledTimes(commandIds.length);
        for (let i = 0; i < commandIds.length; i++) {
            expect(mockedVscode.commands.registerCommand.mock.calls[i][0]).toBe(commandIds[i]);
        }
    }
    it("should activate correctly", () => {

        mockedClient.initializeSessionFromFile.mockReturnValueOnce(false); // Initialization will be covered in another test

        extension.activate(ec);

        expect(mockedVscode.window.registerTreeDataProvider).toHaveBeenCalledTimes(1);
        expect(mockedVscode.window.registerTreeDataProvider).toHaveBeenNthCalledWith(1, "vscode4teachingview", extension.coursesProvider);
        expectAllCommandsToBeRegistered(ec.subscriptions);
    });

    it("should be initialized for students", async () => {
        const exercise: Exercise = {
            id: 50,
            name: "Exercise test",
        };
        const cwds: vscode.WorkspaceFolder[] = [
            {
                uri: mockedVscode.Uri.parse("testURL"),
                index: 0,
                name: exercise.name,
            },
        ];
        const v4tjson = {
            zipLocation: "testZipLocation/" + exercise.id + ".zip",
        };
        const user: User = {
            id: 40,
            roles: [{
                roleName: "ROLE_STUDENT",
            }],
            username: "johndoejr",
        };
        mockedCurrentUser.getUserInfo.mockReturnValue(user);
        const eui: ExerciseUserInfo = {
            exercise,
            user,
            finished: false,
        };
        const euiResponse: AxiosResponse<ExerciseUserInfo> = {
            data: eui,
            config: {},
            headers: {},
            status: 200,
            statusText: "",
        };

        mockedClient.handleAxiosError.mockImplementation((error) => console.error(error));
        mockedClient.getExerciseUserInfo.mockResolvedValueOnce(euiResponse);

        mockedPath.sep = "/";
        mockedPath.resolve.mockReturnValueOnce("testParentURL").mockImplementation((x) => x);

        mockedVscode.workspace.findFiles.mockResolvedValueOnce([mockedVscode.Uri.parse("testV4TLocation")]);
        const fswFunctionMocks: vscode.FileSystemWatcher = {
            dispose: jest.fn(),
            ignoreChangeEvents: false,
            ignoreCreateEvents: false,
            ignoreDeleteEvents: false,
            onDidChange: jest.fn(),
            onDidCreate: jest.fn(),
            onDidDelete: jest.fn(),
        };
        mockedVscode.workspace.createFileSystemWatcher.mockImplementation(() => fswFunctionMocks);

        const bufferMock = Buffer.from("test");
        mockedFs.readFileSync.mockReturnValueOnce(JSON.stringify(v4tjson)).mockReturnValue(bufferMock);
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFile.mockImplementation((filePath, cb) => {
            cb(null, bufferMock);
        });

        mockedCurrentUser.isLoggedIn.mockReturnValueOnce(true);

        mockedFileIgnoreUtil.recursiveReadGitIgnores.mockReturnValue([]);

        await extension.initializeExtension(cwds);

        expect(mockedClient.handleAxiosError).toHaveBeenCalledTimes(0);
        expect(extension.commentProvider?.addCwd).toHaveBeenCalledTimes(1);
        expect(extension.commentProvider?.getThreads).toHaveBeenCalledTimes(1);
        expect(extension.commentInterval).toBeTruthy();
        expect(global.setInterval).toHaveBeenCalledTimes(1);
        expect(global.setInterval).toHaveBeenNthCalledWith(1,
            extension.commentProvider?.getThreads,
            60000,
            exercise.id,
            "johndoejr",
            cwds[0],
            mockedClient.handleAxiosError,
        );
        expect(mockedVscode.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1);
        expect(fswFunctionMocks.onDidChange).toHaveBeenCalledTimes(1);
        expect(fswFunctionMocks.onDidCreate).toHaveBeenCalledTimes(1);
        expect(fswFunctionMocks.onDidDelete).toHaveBeenCalledTimes(1);
        expect(mockedVscode.workspace.onWillSaveTextDocument).toHaveBeenCalledTimes(1);
        expect(mockedVscode.workspace.onDidSaveTextDocument).toHaveBeenCalledTimes(1);
        expect(extension.finishItem).toBeTruthy();
    });

});
