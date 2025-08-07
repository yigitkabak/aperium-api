import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { simpleGit, SimpleGit } from 'simple-git';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const GITHUB_REPO_URL = 'https://github.com/yigitkabak/aperium-repo.git';
const REPO_NAME = 'aperium-repo';

interface LanguageStats {
    totalFiles: number;
    dominantLanguage: string;
    counts: { [key: string]: number };
    percentages: { [key: string]: string };
}

interface FileSystemItem {
    name: string;
    path: string;
    type: 'dir' | 'file';
    children?: FileSystemItem[];
    languageAnalysis?: LanguageStats;
}

const getDetailedDirectoryContents = async (basePath: string, relativePath: string = ''): Promise<FileSystemItem[]> => {
    const fullPath = path.join(basePath, relativePath);
    if (!await fs.pathExists(fullPath) || !(await fs.stat(fullPath)).isDirectory()) {
        return [];
    }

    const items = await fs.readdir(fullPath, { withFileTypes: true });
    const result: FileSystemItem[] = [];

    for (const item of items) {
        if (item.name === '.git') continue;

        const fileItem: FileSystemItem = {
            name: item.name,
            path: path.join(relativePath, item.name),
            type: item.isDirectory() ? 'dir' : 'file',
        };
        if (item.isDirectory()) {
            const children = await getDetailedDirectoryContents(basePath, fileItem.path);
            fileItem.children = children;
            fileItem.languageAnalysis = analyzeLanguages(children);
        }
        result.push(fileItem);
    }
    return result;
};

const analyzeLanguages = (fileStructure: FileSystemItem[]): LanguageStats => {
    let counts: { [key: string]: number } = {};
    let totalFiles = 0;

    const traverse = (items: FileSystemItem[]) => {
        for (const item of items) {
            if (item.type === 'file') {
                totalFiles++;
                const name = item.name.toLowerCase();
                if (name.endsWith('.js')) counts.js = (counts.js || 0) + 1;
                else if (name.endsWith('.ts')) counts.ts = (counts.ts || 0) + 1;
                else if (name.endsWith('.vue')) counts.vue = (counts.vue || 0) + 1;
                else if (name.endsWith('.json')) counts.json = (counts.json || 0) + 1;
                else if (name.endsWith('.html')) counts.html = (counts.html || 0) + 1;
                else if (name.endsWith('.css')) counts.css = (counts.css || 0) + 1;
                else if (name.endsWith('.java')) counts.java = (counts.java || 0) + 1;
                else if (name.endsWith('.cs')) counts.cs = (counts.cs || 0) + 1;
                else if (name.endsWith('.c')) counts.c = (counts.c || 0) + 1;
                else if (name.endsWith('.cpp')) counts.cpp = (counts.cpp || 0) + 1;
                else counts.other = (counts.other || 0) + 1;
            } else if (item.children) {
                traverse(item.children);
            }
        }
    };
    traverse(fileStructure);

    const percentages: { [key: string]: string } = {};
    let dominantLanguage = 'none';
    let maxPercentage = 0;
    
    for (const key in counts) {
        const percentage = totalFiles > 0 ? (counts[key] / totalFiles) * 100 : 0;
        if (percentage > 0) {
            percentages[key] = `${percentage.toFixed(1)}%`;
        }
        if (percentage > maxPercentage) {
            maxPercentage = percentage;
            dominantLanguage = key;
        }
    }
    
    return { totalFiles, dominantLanguage: dominantLanguage.toUpperCase(), counts, percentages };
};

const filterBySearchTerm = (items: FileSystemItem[], searchTerm: string): FileSystemItem[] => {
    const results: FileSystemItem[] = [];
    const lowerSearchTerm = searchTerm.toLowerCase();

    const traverseAndFilter = (currentItems: FileSystemItem[]): FileSystemItem[] => {
        const filtered: FileSystemItem[] = [];
        for (const item of currentItems) {
            if (item.name.toLowerCase().includes(lowerSearchTerm)) {
                filtered.push({ ...item, children: [] });
            } else if (item.children && item.children.length > 0) {
                const childMatches = traverseAndFilter(item.children);
                if (childMatches.length > 0) {
                    filtered.push({ ...item, children: childMatches });
                }
            }
        }
        return filtered;
    };
    return traverseAndFilter(items);
};

const handleApiRequest = async (res: Response, targetPath: string = '', searchTerm?: string) => {
    const tempCloneRoot = path.join(os.tmpdir(), `aperium_api_clone_${Date.now()}`);
    const clonePath = path.join(tempCloneRoot, REPO_NAME);

    try {
        const git: SimpleGit = simpleGit();
        await git.clone(GITHUB_REPO_URL, clonePath, ['--depth=1']);
        
        const fullTargetPath = path.join(clonePath, targetPath);
        if (!await fs.pathExists(fullTargetPath)) {
            await fs.remove(tempCloneRoot);
            return res.status(404).json({
                error: 'Path not found.',
                message: `The file or folder '${targetPath}' does not exist in the repository.`
            });
        }

        const fileStructure = await getDetailedDirectoryContents(clonePath, targetPath);
        
        let filteredStructure = fileStructure;
        if (searchTerm) {
            filteredStructure = filterBySearchTerm(fileStructure, searchTerm);
        }

        const responseData = {
            repoInfo: {
                owner: GITHUB_REPO_URL.split('/').slice(-2)[0],
                repoName: REPO_NAME,
                lastUpdated: new Date().toISOString()
            },
            path: targetPath,
            fileStructure: filteredStructure,
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error('An error occurred during the API request:', error);
        res.status(500).json({ error: 'Server Error', message: 'An unexpected error occurred during the operation.' });
    } finally {
        if (await fs.pathExists(tempCloneRoot)) {
            await fs.remove(tempCloneRoot);
        }
    }
};

app.get('/api/modules', async (req: Request, res: Response) => {
    const searchTerm = req.query.search as string;
    await handleApiRequest(res, 'modules', searchTerm);
});

app.get('/api/repository', async (req: Request, res: Response) => {
    const searchTerm = req.query.search as string;
    await handleApiRequest(res, 'repo/packs', searchTerm);
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}.`);
});
