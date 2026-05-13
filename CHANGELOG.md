[0.1.0]
* Initial version

[0.1.1]
* Fix various sharing things

[0.1.2]
* Fix multiselect
* Add initial context menu
* Update share info on change

[0.1.3]
* Various multiselect fixes
* Add initial drag-n-drop support

[0.1.4]
* Add share link support
* Ask user on upload conflict
* Better multifile selection support for sidebar

[0.1.5]
* Ensure data directory exists on startup
* Only sync resources like users and diskusage one an hour for now

[0.1.6]
* Add ctrl/cmd + a select all shortcut combo
* Improve multi-select sidebar
* Fix file selection
* Add public sharing page for directories
* Update Primevue to 3.6.0

[0.1.7]
* Various fixes related to public shares
* Improved breadcrumbs
* Visual improvements
* Use new logo everywhere

[0.1.8]
* Fix folder drop for upload
* Generate preview URLs on the backend
* Do not leak usernames in webdav listing
* Fix duplicate entries in file listing

[0.1.9]
* Fix share uploads
* Reduce UI flickering
* Condensed view

[0.2.0]
* Allow office documents to be saved through WOPI protocol
* Clear selection on path changes

[0.3.0]
* Various bugfixes
* Less colorful visual distraction
* Support for image thumbnails

[0.4.0]
* Update dependencies
* Update base image to v3.2.0

[0.5.0]
* Improve browser history handling

[0.6.0]
* Update dependencies
* Improve key input handling
* Fix tmp file cleanup
* Improve side bar
* Do not crash on malformed URI input

[0.6.1]
* Ensure we have a fallback preview
* Support previews for uppercase file extensions

[0.6.2]
* Fix previews for shares
* Refactor list component to lazy load large lists
* Fix file dropping for upload

[0.7.0]
* Move from access tokens to cookie sessions

[0.8.0]
* Improve Image viewer
* Update dependencies

[1.0.0]
* Update monaco editor
* Update pdfjs
* Remove primeflex layout engine
* Fixup file deletion
* Fix crash in texteditor language detection

[1.0.1]
* Make multiselect archive download work
* Update dependencies
* File list is now based on flexbox instead of table layouts

[1.0.2]
* Ensure config is loaded on fresh login

[1.1.0]
* Update Cloudron base image to 4.0.0
* Cleanup tmp after successful file upload
* Fix initial load view
* Update dependencies

[1.1.1]
* Reduce LDAP queries
* Hide multi select action buttons on single entries

[1.1.2]
* Fix file rename regression
* Add initial Cloudron tests
* Update dependencies

[1.1.3]
* Update dependencies

[1.1.4]
* Fix various overflow issues
* Update dependencies

[2.0.0]
* Rework most of the UI
* Remove local user support and use OpenID

[2.0.1]
* Fix share link creation
* Fix file paths in some situations
* Move office handle storage from shares to in-memory store

[2.0.2]
* Ensure we escape filenames for postgres regexp usage

[2.0.3]
* Notify users about newly shared items via email
* Update dependencies

[2.0.4]
* Fix various share related issues

[2.0.5]
* Fix downloading of directly shared files
* Fix downloading archive of shared files and folders

[2.0.6]
* Fix context menu on empty folders
* Fix a few keyboard copy/cut/paste shortcuts - still requires the directory view to have focus
* Fix usage of files starting with a # (hash)

[2.0.7]
* Fix breadcrumb display
* Fix various download related encoding issues
* Update dependencies
* Use nodejs from base image

[2.0.8]
* Fix share download content types
* Fix item double activation
* Update dependencies

[2.0.9]
* Fix office suite usage on shared documents

[2.0.10]
* Fix login session expiration
* Some UI fixes

[2.0.11]
* Prepare for group folder
* Better download archive names
* Use more Pankow UI element components

[2.0.12]
* Use more pankow components
* Improve collabora integration
* Use browser native PDF viewer

[2.0.13]
* Fix email notification text for shared items
* Make sidebar work on mobile
* Various cleanups of unused primevue class definitions

[2.1.0]
* Add users view and prepare for admin role
* Many small bigfixes
* Initial dark-mode support

[2.1.1]
* Various mobile layout fixes
* Reduce view flickering
* Darker icon color
* Fixes for admin view

[2.1.2]
* Stream file uploads directly, skip temporary files
* Early dark-mode to avoid white flashes

[2.1.3]
* Fix file upload regression
* Update to new pankow image viewer with better mobile scroll support
* More dark-mode fixes

[2.1.4]
* Use .part paradigm for file uploads
* Use improve ImageViewer from pankow
* Fix folder upload if folder already exists

[2.1.5]
* Fix new file creation
* Fix saving text files
* Handle csv files with office integration if enabled

[2.1.6]
* Fix dropping a folder into the browser view
* Avoid resetting the view on upload progress
* Fix crash when calling setAdmin route
* Move from superagent to Pankow fetcher()

[2.1.7]
* Improve OfficeViewer to reduce vertical space usage

[2.1.8]
* Add settings UI for OfficeViewer
* Various dark mode fixes
* Update dependencies

[2.1.9]
* Reduced UI flickering during load
* Internal project layout refactoring

[2.2.0]
* Add group folder feature
* Add settings view

[2.2.1]
* Improve DirectoryView performance for large folders
* Calculate Groupfolder sizes
* Update dependencies

[2.2.3]
* Update cubby to 2.2.3
* Introduce first version of collaborative markdown editor
* Fix various UI bugs
* Update dependencies

[2.3.0]
* Update cubby to 2.3.0
* Add full text search for files and documents based on recoll

[2.3.1]
* Update cubby to 2.3.1
* Add full text search for files and documents based on recoll

[2.3.2]
* Update cubby to 2.3.2
* Add full text search for files and documents based on recoll
* Fix initial full text search
* Improve startup sequence and make it more stable
* Initiial index building may take some time

[2.3.3]
* Update cubby to 2.3.3
* Fix various chrome issues
* Move search to the center
* Ensure search index does not crash for large folder trees

[2.3.4]
* Update cubby to 2.3.4
* Fix downloading files as archives
* Use inter font

[2.3.5]
* Update cubby to 2.3.4
* Improve serach query speed
* Sort filename matches in search first
* Rewokr search UI
* Update dependencies

[2.3.6]
* Fix folder size calculation
* Search result display improvements
* Update dependencies

[2.3.7]
* Fix various mobile issues
* Dark-mode fixes
* Fix groupfolder disk space usage
* Update dependencies

[2.3.8]
* Fix regression when trying to delete a folder

[2.3.9]
* OnlyOffice can now also be used as office WOPI host
* Various UI fixes
* New file menu in breadcrumbs

[2.3.10]
* Add "Shared by you" listing
* Highlight new and renamed file and folders in the listview
* Update dependencies
* Raise warning and fallback to home if resource is not found

[2.3.11]
* Rework the recent files view
* Update dependencies

[2.3.12]
* Fix folder copy regression
* Close SideBar with swipe on mobile
* Add button to open containing folder of recent files
* Show when a share was created


[2.3.13]
* Update Cubby to 2.3.13
* Fix folder download in shares and group folder
* Some mobile fixes
* Update dependencies
* Add PWA manifest for mobile home screen icon support
[2.3.14]
* Update cubby to 2.3.14
* TextEditor: initial image support
* Fix sharedWith indicator
* Show shares in preview
* Open files directly from recents view

[2.3.15]
* Update cubby to 2.3.15

[2.3.16]
* Update cubby to 2.3.16
* Fix OnlyOffice integration to be able to save changes
* Hide size column on mobile
* Hide markdown formatting buttons on mobile
* Pause audio/video on viewer close

[2.3.17]
* Update cubby to 2.3.17
* Defer indexing to reduce resource usage
* Add support for skeleton directory for new users
* Various MarkdownEditor improvements
* Generate thumbnails if missing also in recents view
* Update dependencies

[2.3.18]
* Update cubby to 2.3.18
* Add favorite files and folder feature

[2.3.19]
* Update cubby to 2.3.19
* Open office documents in new tab
* Allow to open shared office documents if they are owned by a group folder

[2.3.20]
* Update cubby to 2.3.20
* Open text documents in monaco text editor
* Open markdown documents in markdown editor

[2.3.21]
* Update cubby to 2.3.21
* Correctly open office documents in new tab
* Fix json file handling in monaco editor

[2.4.0]
* Update cubby to 2.4.0
* Various UI fixes with new pankow version

[2.5.0]
* Update base image to 5.0.0

[2.5.1]
* Update cubby to 2.4.1
* Update dependencies
* Fix rtf file handling in office integration

[2.5.2]
* Update cubby to 2.4.2
* Fix new file/folder button states
* Update dependencies

[2.5.3]
* Update cubby to 2.4.3
* Set window title for office documents
* Improve office integration settings
* Improve group folder settings
* Preview panel layout fixes
* Port the vuejs app to composition style
* Update dependencies

[2.5.4]
* Update cubby to 2.4.4
* Fix regression in share link creation

[2.5.5]
* Update cubby to 2.4.5
* Fix collaboration bug in markdown editor
* Update dependencies

[2.5.6]
* Update cubby to 2.4.6

[2.5.7]
* Update cubby to 2.4.7
* Fix opening files with spaces

[2.5.8]
* Update cubby to 2.4.8
* Improve search results
* Update dependencies

[2.5.9]
* Update cubby to 2.4.9
* Update dependencies
* Add new logo and match sidebar color better with the UI button colors

[2.5.10]
* Update cubby to 2.4.10
* Always refresh resources if main view changes
* Unify the color gradients
* Fix profile button in dark mode
* Update dependencies

[2.5.11]
* Update cubby to 2.4.11
* Only raise warning on close, if markdown document has actually changed
* Order search results by recently modified
* Update dependencies

[2.5.12]
* Update cubby to 2.4.12
* Fix opening of .json files
* Update dependencies

[2.5.13]
* Update cubby to 2.5.0
* Add basic archive extraction
* Update dependencies

[2.5.14]
* Update cubby to 2.5.1
* Add 3D model viewer

[2.6.0]
* Update cubby to 2.6.0
* Changes to prepare for the android app

[2.6.1]
* Update cubby to 2.6.1
* Fix crash when adding favorites

[2.7.0]
* Update cubby to 2.7.0

[2.7.1]
* Update cubby to 2.7.1
* Fix monaco-text editor
* Update all dependencies and move the app to esm

[2.7.2]
* Update cubby to 2.7.2
* Fix opening office documents which require path encoding

[2.7.4]
* Update cubby to 2.7.4
* Add grid view mode
* Fix dropping multiple files in chromium browsers

[2.7.5]
* Update cubby to 2.7.5
* Fix crash in group folder settings
* Disable non-supported actions in toplevel group folder listing
* Update frontend and backend dependencies
* Fix yjs collaboration sync

[2.7.7]
* Update cubby to 2.7.7
* Fix accessing files in link shares
* Allow to create link shares as read-only or read/write

[2.7.8]
* Update cubby to 2.7.8
* Support readonly mode in TextViewer
* Fix OfficeViewer for shared links
* Fix various login state issues causing flickering

[2.8.0]
* Update cubby to 2.8.0
* Expose groupfolders and shares via webdav. Tested only on linux for the moment.

[2.8.1]
* Update cubby to 2.8.1
* Improve OpenID login session
* Fix rclone and windows webdav connection

[2.9.0]
* Update cubby to 2.9.0
* Implement share expiration
* Add empty share and favorites placeholder
* Also search for subterms not just whole words in files
* Allow to star group folder and shares
* Update dependencies and nodejs

[2.10.0]
* Update cubby to 2.10.0
* Improve error feedback on new file or folder creation
* Various relogin state fixes to not lose target resource
* Ensure public shares can be reopened after session failure
* Update dependencies

[2.11.0]
* Update cubby to 2.11.0
* **Breaking change:** WebDAV endpoints will prompt for a new password. You can create a new app password from the Cloudron dashboard.
* Add SCIM user listing support to preprovision users
* Use the Vite proxy setup for local development
* Use @cloudron/connect-lastmile
* Move user count into the header
* Improve the users view and add basic search
* Use the Cloudron auth endpoint for WebDAV
* Remove WebDAV UI
* Purge password and salt from user signup code paths as well
* Fix displaying search results in group folders
* Fix search results max-height

