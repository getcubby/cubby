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
